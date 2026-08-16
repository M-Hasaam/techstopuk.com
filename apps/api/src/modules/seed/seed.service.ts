import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { TradeInQuestionsService } from '../trade-in-questions/trade-in-questions.service';
import { S3Client, PutObjectCommand, DeleteObjectsCommand, ListObjectsV2Command, HeadObjectCommand } from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as path from 'path';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * "apple[iphone]" → { slug: "apple", alias: "iphone" }
 * "samsung"       → { slug: "samsung", alias: null }
 * slug  = DB brand identity
 * alias = display name within this category (e.g. "iPhone", "Xbox")
 */
function parseBrandFolderName(folderName: string): { slug: string; alias: string | null } {
    const match = folderName.match(/^([^\[]+)(?:\[([^\]]+)\])?$/);
    const slug  = (match?.[1] ?? folderName).trim().toLowerCase();
    const raw   = match?.[2]?.trim().toLowerCase() ?? null;
    return { slug, alias: raw && raw !== slug ? raw : null };
}

function isImageFile(name: string): boolean {
    return /\.(jpg|jpeg|png|webp)$/i.test(name);
}

function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

// Per-slug flags: which categories support trade-in selling and/or repair
const CATEGORY_FLAGS: Record<string, { isSellable: boolean; isRepairable: boolean }> = {
    phones:      { isSellable: true,  isRepairable: true  },
    tablets:     { isSellable: true,  isRepairable: true  },
    gaming:      { isSellable: true,  isRepairable: true  },
    laptops:     { isSellable: true,  isRepairable: true  },
    audio:       { isSellable: true,  isRepairable: false },
    smartwatches:{ isSellable: true,  isRepairable: false },
};
function categoryFlags(slug: string) {
    return CATEGORY_FLAGS[slug] ?? { isSellable: false, isRepairable: false };
}

// Per-slug display copy — never had a source anywhere, so categories only ever
// got a bare capitalized `name` from the seed script (no displayName/description).
const CATEGORY_META: Record<string, { displayName: string; description: string; icon: string }> = {
    phones:       { displayName: 'Smartphones',        description: 'Certified refurbished phones from Apple, Samsung, Google and more.', icon: 'smartphone' },
    tablets:      { displayName: 'Tablets & iPads',     description: 'Refurbished tablets for work, study and entertainment.',            icon: 'tablet' },
    gaming:       { displayName: 'Gaming',              description: 'PlayStation, Xbox and Switch consoles, tested and graded.',         icon: 'gamepad-2' },
    laptops:      { displayName: 'Laptops & MacBooks',  description: 'Refurbished laptops and MacBooks for every budget.',                 icon: 'laptop' },
    audio:        { displayName: 'Audio & Headphones',  description: 'Headphones, earbuds and speakers from top audio brands.',            icon: 'headphones' },
    smartwatches: { displayName: 'Smartwatches',        description: 'Refurbished smartwatches and fitness trackers.',                    icon: 'watch' },
    cables:       { displayName: 'Cables & Adapters',   description: 'Charging and data cables.',                                         icon: 'zap' },
    chargers:     { displayName: 'Chargers & Power',    description: 'Fast chargers and power banks.',                                     icon: 'zap' },
    storage:      { displayName: 'Storage & SSDs',      description: 'External drives and memory cards.',                                  icon: 'hard-drive' },
    memory:       { displayName: 'Memory & RAM',        description: 'Computer memory upgrades.',                                          icon: 'cpu' },
    mouse:        { displayName: 'Mouse & Keyboards',   description: 'Mice, keyboards and input devices.',                                 icon: 'mouse' },
    graphics:     { displayName: 'Graphics Cards',      description: 'GPUs and display adapters.',                                         icon: 'monitor' },
    lens:         { displayName: 'Camera Lenses',       description: 'Camera lenses and accessories.',                                     icon: 'camera' },
    films:        { displayName: 'Films & Media',       description: 'Movies, physical media and films.',                                  icon: 'film' },
    games:        { displayName: 'Games & Discs',       description: 'Video games and media discs.',                                       icon: 'disc' },
};
function categoryMeta(slug: string) {
    return CATEGORY_META[slug] ?? { icon: 'package' };
}

const PRICING_DEFAULTS = [
    { key: 'multiplier_new', value: 1.20, label: 'New condition multiplier (% of market price)' },
    { key: 'multiplier_a',   value: 1.05, label: 'A Grade multiplier — used but like new (% of market price)' },
    { key: 'multiplier_b',   value: 0.85, label: 'B Grade multiplier — minor signs of use (% of market price)' },
    { key: 'multiplier_c',   value: 0.65, label: 'C Grade multiplier — heavy scratches/marks (% of market price)' },
    { key: 'multiplier_f',   value: 0.25, label: 'F Grade multiplier — non-working, parts only (% of market price)' },
    { key: 'show_unpriced_products', value: 0, label: 'Show unpriced products on storefront (0=hide, 1=show)' },
];

// Colors below are each model's real official retail color lineup (verified against
// Apple/Samsung/Sony/Microsoft product pages and launch coverage), not placeholders.
const DEVICE_CATALOG = [
    { brand: 'Apple', model: 'iPhone 11', category: 'phones', storageOptions: ['64GB', '128GB', '256GB'],
      attributeOptions: [{ label: 'Color', options: ['Black', 'Green', 'Yellow', 'Purple', 'Red', 'White'] }] },
    { brand: 'Apple', model: 'iPhone 11 Pro', category: 'phones', storageOptions: ['64GB', '256GB', '512GB'],
      attributeOptions: [{ label: 'Color', options: ['Midnight Green', 'Space Gray', 'Silver', 'Gold'] }] },
    { brand: 'Apple', model: 'iPhone 11 Pro Max', category: 'phones', storageOptions: ['64GB', '256GB', '512GB'],
      attributeOptions: [{ label: 'Color', options: ['Midnight Green', 'Space Gray', 'Silver', 'Gold'] }] },
    { brand: 'Apple', model: 'iPhone 12', category: 'phones', storageOptions: ['64GB', '128GB', '256GB'],
      attributeOptions: [{ label: 'Color', options: ['Black', 'White', 'Red', 'Green', 'Blue', 'Purple'] }] },
    { brand: 'Apple', model: 'iPhone 12 Mini', category: 'phones', storageOptions: ['64GB', '128GB', '256GB'],
      attributeOptions: [{ label: 'Color', options: ['Black', 'White', 'Red', 'Green', 'Blue', 'Purple'] }] },
    { brand: 'Apple', model: 'iPhone 12 Pro', category: 'phones', storageOptions: ['128GB', '256GB', '512GB'],
      attributeOptions: [{ label: 'Color', options: ['Graphite', 'Silver', 'Gold', 'Pacific Blue'] }] },
    { brand: 'Apple', model: 'iPhone 12 Pro Max', category: 'phones', storageOptions: ['128GB', '256GB', '512GB'],
      attributeOptions: [{ label: 'Color', options: ['Graphite', 'Silver', 'Gold', 'Pacific Blue'] }] },
    { brand: 'Apple', model: 'iPhone 13', category: 'phones', storageOptions: ['128GB', '256GB', '512GB'],
      attributeOptions: [{ label: 'Color', options: ['Pink', 'Blue', 'Midnight', 'Starlight', 'Red', 'Green'] }] },
    { brand: 'Apple', model: 'iPhone 13 Mini', category: 'phones', storageOptions: ['128GB', '256GB', '512GB'],
      attributeOptions: [{ label: 'Color', options: ['Pink', 'Blue', 'Midnight', 'Starlight', 'Red', 'Green'] }] },
    { brand: 'Apple', model: 'iPhone 13 Pro', category: 'phones', storageOptions: ['128GB', '256GB', '512GB', '1TB'],
      attributeOptions: [{ label: 'Color', options: ['Graphite', 'Gold', 'Silver', 'Sierra Blue', 'Alpine Green'] }] },
    { brand: 'Apple', model: 'iPhone 13 Pro Max', category: 'phones', storageOptions: ['128GB', '256GB', '512GB', '1TB'],
      attributeOptions: [{ label: 'Color', options: ['Graphite', 'Gold', 'Silver', 'Sierra Blue', 'Alpine Green'] }] },
    { brand: 'Apple', model: 'iPhone 14', category: 'phones', storageOptions: ['128GB', '256GB', '512GB'],
      attributeOptions: [{ label: 'Color', options: ['Midnight', 'Purple', 'Starlight', 'Red', 'Blue', 'Yellow'] }] },
    { brand: 'Apple', model: 'iPhone 14 Plus', category: 'phones', storageOptions: ['128GB', '256GB', '512GB'],
      attributeOptions: [{ label: 'Color', options: ['Midnight', 'Purple', 'Starlight', 'Red', 'Blue', 'Yellow'] }] },
    { brand: 'Apple', model: 'iPhone 14 Pro', category: 'phones', storageOptions: ['128GB', '256GB', '512GB', '1TB'],
      attributeOptions: [{ label: 'Color', options: ['Space Black', 'Silver', 'Gold', 'Deep Purple'] }] },
    { brand: 'Apple', model: 'iPhone 14 Pro Max', category: 'phones', storageOptions: ['128GB', '256GB', '512GB', '1TB'],
      attributeOptions: [{ label: 'Color', options: ['Space Black', 'Silver', 'Gold', 'Deep Purple'] }] },
    { brand: 'Apple', model: 'iPhone 15', category: 'phones', storageOptions: ['128GB', '256GB', '512GB'],
      attributeOptions: [{ label: 'Color', options: ['Black', 'Blue', 'Green', 'Yellow', 'Pink'] }] },
    { brand: 'Apple', model: 'iPhone 15 Plus', category: 'phones', storageOptions: ['128GB', '256GB', '512GB'],
      attributeOptions: [{ label: 'Color', options: ['Black', 'Blue', 'Green', 'Yellow', 'Pink'] }] },
    { brand: 'Apple', model: 'iPhone 15 Pro', category: 'phones', storageOptions: ['128GB', '256GB', '512GB', '1TB'],
      attributeOptions: [{ label: 'Color', options: ['Black Titanium', 'White Titanium', 'Blue Titanium', 'Natural Titanium'] }] },
    { brand: 'Apple', model: 'iPhone 15 Pro Max', category: 'phones', storageOptions: ['256GB', '512GB', '1TB'],
      attributeOptions: [{ label: 'Color', options: ['Black Titanium', 'White Titanium', 'Blue Titanium', 'Natural Titanium'] }] },
    { brand: 'Samsung', model: 'Galaxy S21 5G', category: 'phones', storageOptions: ['128GB', '256GB'],
      attributeOptions: [{ label: 'Color', options: ['Phantom Gray', 'Phantom White', 'Phantom Violet', 'Phantom Pink'] }] },
    { brand: 'Samsung', model: 'Galaxy S21 Plus 5G', category: 'phones', storageOptions: ['128GB', '256GB'],
      attributeOptions: [{ label: 'Color', options: ['Phantom Black', 'Phantom Silver', 'Phantom Violet'] }] },
    { brand: 'Samsung', model: 'Galaxy S21 Ultra 5G', category: 'phones', storageOptions: ['128GB', '256GB', '512GB'],
      attributeOptions: [{ label: 'Color', options: ['Phantom Black', 'Phantom Silver'] }] },
    { brand: 'Samsung', model: 'Galaxy S22', category: 'phones', storageOptions: ['128GB', '256GB'],
      attributeOptions: [{ label: 'Color', options: ['Phantom White', 'Phantom Black', 'Green', 'Pink Gold'] }] },
    { brand: 'Samsung', model: 'Galaxy S22 Plus', category: 'phones', storageOptions: ['128GB', '256GB'],
      attributeOptions: [{ label: 'Color', options: ['Phantom White', 'Phantom Black', 'Green', 'Pink Gold'] }] },
    { brand: 'Samsung', model: 'Galaxy S22 Ultra', category: 'phones', storageOptions: ['128GB', '256GB', '512GB', '1TB'],
      attributeOptions: [{ label: 'Color', options: ['Phantom White', 'Phantom Black', 'Green', 'Burgundy'] }] },
    { brand: 'Samsung', model: 'Galaxy S23', category: 'phones', storageOptions: ['128GB', '256GB', '512GB'],
      attributeOptions: [{ label: 'Color', options: ['Phantom Black', 'Cream', 'Green', 'Lavender'] }] },
    { brand: 'Samsung', model: 'Galaxy S23 Plus', category: 'phones', storageOptions: ['256GB', '512GB'],
      attributeOptions: [{ label: 'Color', options: ['Phantom Black', 'Cream', 'Green', 'Lavender'] }] },
    { brand: 'Samsung', model: 'Galaxy S23 Ultra', category: 'phones', storageOptions: ['256GB', '512GB', '1TB'],
      attributeOptions: [{ label: 'Color', options: ['Phantom Black', 'Cream', 'Green', 'Lavender'] }] },
    { brand: 'Samsung', model: 'Galaxy S24', category: 'phones', storageOptions: ['128GB', '256GB', '512GB'],
      attributeOptions: [{ label: 'Color', options: ['Onyx Black', 'Marble Gray', 'Cobalt Violet', 'Amber Yellow'] }] },
    { brand: 'Samsung', model: 'Galaxy S24 Plus', category: 'phones', storageOptions: ['256GB', '512GB'],
      attributeOptions: [{ label: 'Color', options: ['Onyx Black', 'Marble Gray', 'Cobalt Violet', 'Amber Yellow'] }] },
    { brand: 'Samsung', model: 'Galaxy S24 Ultra', category: 'phones', storageOptions: ['256GB', '512GB', '1TB'],
      attributeOptions: [{ label: 'Color', options: ['Titanium Black', 'Titanium Gray', 'Titanium Violet', 'Titanium Yellow'] }] },
    { brand: 'Apple', model: 'iPad 9th Gen', category: 'tablets', storageOptions: ['64GB', '256GB'],
      attributeOptions: [
          { label: 'Color', options: ['Silver', 'Space Gray'] },
          { label: 'Connectivity', options: ['WiFi', 'WiFi + Cellular'] },
      ] },
    { brand: 'Apple', model: 'iPad 10th Gen', category: 'tablets', storageOptions: ['64GB', '256GB'],
      attributeOptions: [
          { label: 'Color', options: ['Silver', 'Blue', 'Pink', 'Yellow'] },
          { label: 'Connectivity', options: ['WiFi', 'WiFi + Cellular'] },
      ] },
    { brand: 'Apple', model: 'iPad Air 5th Gen', category: 'tablets', storageOptions: ['64GB', '256GB'],
      attributeOptions: [
          { label: 'Color', options: ['Space Gray', 'Starlight', 'Pink', 'Purple', 'Blue'] },
          { label: 'Connectivity', options: ['WiFi', 'WiFi + Cellular'] },
      ] },
    { brand: 'Apple', model: 'iPad Mini 6th Gen', category: 'tablets', storageOptions: ['64GB', '256GB'],
      attributeOptions: [
          { label: 'Color', options: ['Space Gray', 'Pink', 'Purple', 'Starlight'] },
          { label: 'Connectivity', options: ['WiFi', 'WiFi + Cellular'] },
      ] },
    { brand: 'Apple', model: 'iPad Pro 11-inch M1', category: 'tablets', storageOptions: ['128GB', '256GB', '512GB', '1TB', '2TB'],
      attributeOptions: [
          { label: 'Color', options: ['Space Gray', 'Silver'] },
          { label: 'Connectivity', options: ['WiFi', 'WiFi + Cellular'] },
      ] },
    { brand: 'Apple', model: 'iPad Pro 11-inch M2', category: 'tablets', storageOptions: ['128GB', '256GB', '512GB', '1TB', '2TB'],
      attributeOptions: [
          { label: 'Color', options: ['Space Gray', 'Silver'] },
          { label: 'Connectivity', options: ['WiFi', 'WiFi + Cellular'] },
      ] },
    { brand: 'Apple', model: 'iPad Pro 12.9-inch M1', category: 'tablets', storageOptions: ['128GB', '256GB', '512GB', '1TB', '2TB'],
      attributeOptions: [
          { label: 'Color', options: ['Space Gray', 'Silver'] },
          { label: 'Connectivity', options: ['WiFi', 'WiFi + Cellular'] },
      ] },
    { brand: 'Apple', model: 'iPad Pro 12.9-inch M2', category: 'tablets', storageOptions: ['128GB', '256GB', '512GB', '1TB', '2TB'],
      attributeOptions: [
          { label: 'Color', options: ['Space Gray', 'Silver'] },
          { label: 'Connectivity', options: ['WiFi', 'WiFi + Cellular'] },
      ] },
    { brand: 'Sony', model: 'PlayStation 3 Slim', category: 'gaming', storageOptions: ['120GB', '250GB', '320GB', '500GB'] },
    // Jet Black / Glacier White were real retail colors for the PS4 body — most other
    // consoles below only ever shipped as a single standard color at retail (custom
    // console "colors" seen online are usually detachable faceplates, a separate
    // aftermarket accessory, not a factory option), so they're left without a Color attribute.
    { brand: 'Sony', model: 'PlayStation 4', category: 'gaming', storageOptions: ['500GB', '1TB'],
      attributeOptions: [{ label: 'Color', options: ['Jet Black', 'Glacier White'] }] },
    { brand: 'Sony', model: 'PlayStation 4 Slim', category: 'gaming', storageOptions: ['500GB', '1TB'],
      attributeOptions: [{ label: 'Color', options: ['Jet Black', 'Glacier White'] }] },
    { brand: 'Sony', model: 'PlayStation 4 Pro', category: 'gaming', storageOptions: ['1TB'] },
    // The 1TB size never shipped in the original PS5 chassis — Sony only ever sold 1TB as
    // the newer "Slim" revision, which CeX lists as its own distinct product line, priced
    // differently. Same pattern as "PlayStation 4" vs "PlayStation 4 Slim" above.
    { brand: 'Sony', model: 'PlayStation 5 Disc Edition', category: 'gaming', storageOptions: ['825GB'] },
    { brand: 'Sony', model: 'PlayStation 5 Digital Edition', category: 'gaming', storageOptions: ['825GB'] },
    { brand: 'Sony', model: 'PlayStation 5 Slim', category: 'gaming', storageOptions: ['1TB'] },
    { brand: 'Sony', model: 'PlayStation 5 Slim Digital Edition', category: 'gaming', storageOptions: ['1TB'] },
    { brand: 'Microsoft', model: 'Xbox 360 Slim', category: 'gaming', storageOptions: ['4GB', '250GB', '320GB'] },
    { brand: 'Microsoft', model: 'Xbox One', category: 'gaming', storageOptions: ['500GB', '1TB'] },
    { brand: 'Microsoft', model: 'Xbox One S', category: 'gaming', storageOptions: ['500GB', '1TB', '2TB'] },
    { brand: 'Microsoft', model: 'Xbox One X', category: 'gaming', storageOptions: ['1TB'] },
    { brand: 'Microsoft', model: 'Xbox Series S', category: 'gaming', storageOptions: ['512GB', '1TB'] },
    { brand: 'Microsoft', model: 'Xbox Series X', category: 'gaming', storageOptions: ['1TB'] },
    // Colors and RAM below match Apple's actual retail configurations for each model.
    // No release year in the name — the chip already disambiguates each line, and CeX
    // identifies these by internal model number rather than year anyway (the scraper
    // already strips a "(YYYY)" suffix before matching, so it was never load-bearing).
    {
        brand: 'Apple', model: 'MacBook Air 13-inch M1', category: 'laptops',
        storageOptions: ['256GB', '512GB', '1TB'],
        attributeOptions: [
            { label: 'Color', options: ['Space Gray', 'Silver', 'Gold'] },
            { label: 'RAM',   options: ['8GB', '16GB'] },
        ],
    },
    // Apple sold two genuinely different M2 Air models — a 13" (2022) and a later,
    // larger 15" (2023) with a bigger battery and six-speaker sound system. Same
    // storage/RAM/color options for both, but CeX prices them differently.
    {
        brand: 'Apple', model: 'MacBook Air 13-inch M2', category: 'laptops',
        storageOptions: ['256GB', '512GB', '1TB', '2TB'],
        attributeOptions: [
            { label: 'Color', options: ['Space Gray', 'Silver', 'Starlight', 'Midnight'] },
            { label: 'RAM',   options: ['8GB', '16GB', '24GB'] },
        ],
    },
    {
        brand: 'Apple', model: 'MacBook Air 15-inch M2', category: 'laptops',
        storageOptions: ['256GB', '512GB', '1TB', '2TB'],
        attributeOptions: [
            { label: 'Color', options: ['Space Gray', 'Silver', 'Starlight', 'Midnight'] },
            { label: 'RAM',   options: ['8GB', '16GB', '24GB'] },
        ],
    },
    {
        brand: 'Apple', model: 'MacBook Pro 13-inch M1', category: 'laptops',
        storageOptions: ['256GB', '512GB', '1TB', '2TB'],
        attributeOptions: [
            { label: 'Color', options: ['Space Gray', 'Silver'] },
            { label: 'RAM',   options: ['8GB', '16GB'] },
        ],
    },
    {
        brand: 'Apple', model: 'MacBook Pro 14-inch M2 Pro', category: 'laptops',
        storageOptions: ['512GB', '1TB', '2TB'],
        attributeOptions: [
            { label: 'Color', options: ['Space Gray', 'Silver'] },
            { label: 'RAM',   options: ['16GB', '32GB'] },
        ],
    },
    {
        brand: 'Apple', model: 'MacBook Pro 16-inch M3 Max', category: 'laptops',
        storageOptions: ['1TB', '2TB', '4TB'],
        attributeOptions: [
            { label: 'Color', options: ['Space Black', 'Silver'] },
            { label: 'RAM',   options: ['36GB', '48GB', '64GB', '128GB'] },
        ],
    },
    {
        brand: 'Apple', model: 'MacBook Air 13-inch M3', category: 'laptops',
        storageOptions: ['256GB', '512GB', '1TB', '2TB'],
        attributeOptions: [
            { label: 'Color', options: ['Space Gray', 'Silver', 'Starlight', 'Midnight'] },
            { label: 'RAM',   options: ['8GB', '16GB', '24GB'] },
        ],
    },
    {
        brand: 'Apple', model: 'MacBook Air 15-inch M3', category: 'laptops',
        storageOptions: ['256GB', '512GB', '1TB', '2TB'],
        attributeOptions: [
            { label: 'Color', options: ['Space Gray', 'Silver', 'Starlight', 'Midnight'] },
            { label: 'RAM',   options: ['8GB', '16GB', '24GB'] },
        ],
    },
    {
        brand: 'Apple', model: 'MacBook Pro 14-inch M3 Pro', category: 'laptops',
        storageOptions: ['512GB', '1TB', '2TB'],
        attributeOptions: [
            { label: 'Color', options: ['Space Black', 'Silver'] },
            { label: 'RAM',   options: ['18GB', '36GB'] },
        ],
    },
    {
        brand: 'Apple', model: 'MacBook Pro 14-inch M3 Max', category: 'laptops',
        storageOptions: ['1TB', '2TB', '4TB'],
        attributeOptions: [
            { label: 'Color', options: ['Space Black', 'Silver'] },
            { label: 'RAM',   options: ['36GB', '48GB', '64GB', '128GB'] },
        ],
    },
    {
        brand: 'Apple', model: 'MacBook Pro 16-inch M3 Pro', category: 'laptops',
        storageOptions: ['512GB', '1TB', '2TB'],
        attributeOptions: [
            { label: 'Color', options: ['Space Black', 'Silver'] },
            { label: 'RAM',   options: ['18GB', '36GB'] },
        ],
    },
];

const TRADE_IN_DEVICES_SEED = [
    // Phones — Apple
    { name: "iPhone 15 Pro Max",       brand: "Apple",           category: "Phone" },
    { name: "iPhone 15 Pro",           brand: "Apple",           category: "Phone" },
    { name: "iPhone 15 Plus",          brand: "Apple",           category: "Phone" },
    { name: "iPhone 15",               brand: "Apple",           category: "Phone" },
    { name: "iPhone 14 Pro Max",       brand: "Apple",           category: "Phone" },
    { name: "iPhone 14 Pro",           brand: "Apple",           category: "Phone" },
    { name: "iPhone 14 Plus",          brand: "Apple",           category: "Phone" },
    { name: "iPhone 14",               brand: "Apple",           category: "Phone" },
    { name: "iPhone 13 Pro Max",       brand: "Apple",           category: "Phone" },
    { name: "iPhone 13 Pro",           brand: "Apple",           category: "Phone" },
    { name: "iPhone 13",               brand: "Apple",           category: "Phone" },
    { name: "iPhone 12 Pro Max",       brand: "Apple",           category: "Phone" },
    { name: "iPhone 12 Pro",           brand: "Apple",           category: "Phone" },
    { name: "iPhone 12",               brand: "Apple",           category: "Phone" },
    { name: "iPhone 11 Pro Max",       brand: "Apple",           category: "Phone" },
    { name: "iPhone 11 Pro",           brand: "Apple",           category: "Phone" },
    { name: "iPhone 11",               brand: "Apple",           category: "Phone" },
    { name: "Galaxy S24 Ultra",        brand: "Samsung",         category: "Phone" },
    { name: "Galaxy S24+",             brand: "Samsung",         category: "Phone" },
    { name: "Galaxy S24",              brand: "Samsung",         category: "Phone" },
    { name: "Galaxy S23 Ultra",        brand: "Samsung",         category: "Phone" },
    { name: "Galaxy S23+",             brand: "Samsung",         category: "Phone" },
    { name: "Galaxy S23",              brand: "Samsung",         category: "Phone" },
    { name: "Galaxy S22 Ultra",        brand: "Samsung",         category: "Phone" },
    { name: "Galaxy S22+",             brand: "Samsung",         category: "Phone" },
    { name: "Galaxy S22",              brand: "Samsung",         category: "Phone" },
    { name: "Galaxy S21 Ultra",        brand: "Samsung",         category: "Phone" },
    { name: "Galaxy S21+",             brand: "Samsung",         category: "Phone" },
    { name: "Galaxy S21",              brand: "Samsung",         category: "Phone" },
    { name: "Galaxy A54",              brand: "Samsung",         category: "Phone" },
    { name: "Galaxy A34",              brand: "Samsung",         category: "Phone" },
    { name: "Galaxy Z Fold 5",         brand: "Samsung",         category: "Phone" },
    { name: "Galaxy Z Flip 5",         brand: "Samsung",         category: "Phone" },
    { name: "Pixel 8 Pro",             brand: "Google",          category: "Phone" },
    { name: "Pixel 8",                 brand: "Google",          category: "Phone" },
    { name: "Pixel 7 Pro",             brand: "Google",          category: "Phone" },
    { name: "Pixel 7",                 brand: "Google",          category: "Phone" },
    { name: "Pixel 6 Pro",             brand: "Google",          category: "Phone" },
    { name: "Pixel 6",                 brand: "Google",          category: "Phone" },
    { name: "OnePlus 12",              brand: "OnePlus",         category: "Phone" },
    { name: "OnePlus 11",              brand: "OnePlus",         category: "Phone" },
    { name: "OnePlus 10 Pro",          brand: "OnePlus",         category: "Phone" },
    { name: "Nothing Phone (2)",       brand: "Nothing",         category: "Phone" },
    { name: "Nothing Phone (1)",       brand: "Nothing",         category: "Phone" },
    { name: "Edge 50 Pro",             brand: "Motorola",        category: "Phone" },
    { name: "Edge 40 Pro",             brand: "Motorola",        category: "Phone" },
    { name: "Moto G84",                brand: "Motorola",        category: "Phone" },
    { name: "Redmi Note 13 Pro",       brand: "Xiaomi",          category: "Phone" },
    { name: "Redmi Note 13",           brand: "Xiaomi",          category: "Phone" },
    { name: "Redmi Note 12",           brand: "Xiaomi",          category: "Phone" },
    { name: "Redmi Note 11 Pro",       brand: "Xiaomi",          category: "Phone" },
    { name: "Redmi Note 10 Pro",       brand: "Xiaomi",          category: "Phone" },
    { name: "Redmi Note 10 5G",        brand: "Xiaomi",          category: "Phone" },
    { name: "Redmi Note 9S",           brand: "Xiaomi",          category: "Phone" },
    { name: "Xiaomi 13 Pro",           brand: "Xiaomi",          category: "Phone" },
    { name: "Xiaomi 13",               brand: "Xiaomi",          category: "Phone" },
    { name: "P60 Pro",                 brand: "Huawei",          category: "Phone" },
    { name: "P50 Pro",                 brand: "Huawei",          category: "Phone" },
    { name: "Mate 50 Pro",             brand: "Huawei",          category: "Phone" },
    { name: "Nokia G60 5G",            brand: "Nokia",           category: "Phone" },
    { name: "Nokia XR21",              brand: "Nokia",           category: "Phone" },
    { name: "Xperia 1 V",              brand: "Sony",            category: "Phone" },
    { name: "Xperia 5 V",              brand: "Sony",            category: "Phone" },
    { name: "Xperia 10 V",             brand: "Sony",            category: "Phone" },
    { name: "Find X6 Pro",             brand: "Oppo",            category: "Phone" },
    { name: "Reno 10 Pro",             brand: "Oppo",            category: "Phone" },
    { name: "Magic5 Pro",              brand: "Honor",           category: "Phone" },
    { name: "Fairphone 5",             brand: "Fairphone",       category: "Phone" },
    { name: "Fairphone 4",             brand: "Fairphone",       category: "Phone" },
    // Laptops
    { name: "MacBook Pro 16 M3 Max",   brand: "Apple",           category: "Laptop" },
    { name: "MacBook Pro 16 M3 Pro",   brand: "Apple",           category: "Laptop" },
    { name: "MacBook Pro 14 M3 Max",   brand: "Apple",           category: "Laptop" },
    { name: "MacBook Pro 14 M3 Pro",   brand: "Apple",           category: "Laptop" },
    { name: "MacBook Air 15 M3",       brand: "Apple",           category: "Laptop" },
    { name: "MacBook Air 13 M3",       brand: "Apple",           category: "Laptop" },
    { name: "MacBook Air 15 M2",       brand: "Apple",           category: "Laptop" },
    { name: "MacBook Air 13 M2",       brand: "Apple",           category: "Laptop" },
    { name: "MacBook Air 13 M1",       brand: "Apple",           category: "Laptop" },
    { name: "XPS 15 (2024)",           brand: "Dell",            category: "Laptop" },
    { name: "XPS 13 (2024)",           brand: "Dell",            category: "Laptop" },
    { name: "Inspiron 15",             brand: "Dell",            category: "Laptop" },
    { name: "ThinkPad X1 Carbon Gen 12", brand: "Lenovo",        category: "Laptop" },
    { name: "ThinkPad T14s Gen 5",     brand: "Lenovo",          category: "Laptop" },
    { name: "IdeaPad Slim 5",          brand: "Lenovo",          category: "Laptop" },
    { name: "Legion 5i Gen 9",         brand: "Lenovo",          category: "Laptop" },
    { name: "Spectre x360 14",         brand: "HP",              category: "Laptop" },
    { name: "EliteBook 840 G11",       brand: "HP",              category: "Laptop" },
    { name: "Pavilion 15",             brand: "HP",              category: "Laptop" },
    { name: "ZenBook 14 OLED",         brand: "ASUS",            category: "Laptop" },
    { name: "ROG Zephyrus G14 2024",   brand: "ASUS",            category: "Laptop" },
    { name: "Surface Pro 11",          brand: "Microsoft",       category: "Laptop" },
    { name: "Surface Pro 10",          brand: "Microsoft",       category: "Laptop" },
    { name: "Surface Laptop 5",        brand: "Microsoft",       category: "Laptop" },
    // Consoles
    { name: "PS5 Disc Edition",        brand: "Sony PlayStation", category: "Console" },
    { name: "PS5 Digital Edition",     brand: "Sony PlayStation", category: "Console" },
    { name: "PS4 Pro",                 brand: "Sony PlayStation", category: "Console" },
    { name: "PS4 Slim",                brand: "Sony PlayStation", category: "Console" },
    { name: "PS4",                     brand: "Sony PlayStation", category: "Console" },
    { name: "Xbox Series X",           brand: "Microsoft Xbox",  category: "Console" },
    { name: "Xbox Series S",           brand: "Microsoft Xbox",  category: "Console" },
    { name: "Xbox One X",              brand: "Microsoft Xbox",  category: "Console" },
    { name: "Xbox One S",              brand: "Microsoft Xbox",  category: "Console" },
    { name: "Nintendo Switch OLED",    brand: "Nintendo",        category: "Console" },
    { name: "Nintendo Switch V2",      brand: "Nintendo",        category: "Console" },
    { name: "Nintendo Switch Lite",    brand: "Nintendo",        category: "Console" },
    // Tablets
    { name: "iPad Pro 13 M4",          brand: "Apple",           category: "Tablet" },
    { name: "iPad Pro 11 M4",          brand: "Apple",           category: "Tablet" },
    { name: "iPad Air 13 M2",          brand: "Apple",           category: "Tablet" },
    { name: "iPad Air 11 M2",          brand: "Apple",           category: "Tablet" },
    { name: "iPad mini 7th Gen",       brand: "Apple",           category: "Tablet" },
    { name: "iPad Pro 13 M2",          brand: "Apple",           category: "Tablet" },
    { name: "iPad Pro 11 M2",          brand: "Apple",           category: "Tablet" },
    { name: "iPad Air 5th Gen",        brand: "Apple",           category: "Tablet" },
    { name: "iPad 10th Gen",           brand: "Apple",           category: "Tablet" },
    { name: "iPad 9th Gen",            brand: "Apple",           category: "Tablet" },
    { name: "Galaxy Tab S10 Ultra",    brand: "Samsung",         category: "Tablet" },
    { name: "Galaxy Tab S10+",         brand: "Samsung",         category: "Tablet" },
    { name: "Galaxy Tab S10",          brand: "Samsung",         category: "Tablet" },
    { name: "Galaxy Tab S9 Ultra",     brand: "Samsung",         category: "Tablet" },
    { name: "Galaxy Tab S9+",          brand: "Samsung",         category: "Tablet" },
    { name: "Galaxy Tab S9",           brand: "Samsung",         category: "Tablet" },
    // Smartwatches
    { name: "Apple Watch Ultra 2",     brand: "Apple",           category: "Smartwatch" },
    { name: "Apple Watch Series 9",    brand: "Apple",           category: "Smartwatch" },
    { name: "Apple Watch Series 8",    brand: "Apple",           category: "Smartwatch" },
    { name: "Apple Watch SE 2nd Gen",  brand: "Apple",           category: "Smartwatch" },
    { name: "Galaxy Watch 6 Classic",  brand: "Samsung",         category: "Smartwatch" },
    { name: "Galaxy Watch 6",          brand: "Samsung",         category: "Smartwatch" },
    { name: "Galaxy Watch 5 Pro",      brand: "Samsung",         category: "Smartwatch" },
    { name: "Fitbit Sense 2",          brand: "Fitbit",          category: "Smartwatch" },
    { name: "Fitbit Versa 4",          brand: "Fitbit",          category: "Smartwatch" },
    // Audio
    { name: "AirPods Max",             brand: "Apple",           category: "Audio" },
    { name: "AirPods Pro 2",           brand: "Apple",           category: "Audio" },
    { name: "AirPods Pro",             brand: "Apple",           category: "Audio" },
    { name: "AirPods 3rd Gen",         brand: "Apple",           category: "Audio" },
    { name: "WH-1000XM5",              brand: "Sony",            category: "Audio" },
    { name: "WF-1000XM5",              brand: "Sony",            category: "Audio" },
    { name: "WH-1000XM4",              brand: "Sony",            category: "Audio" },
    { name: "QuietComfort Ultra",      brand: "Bose",            category: "Audio" },
    { name: "QuietComfort Earbuds II", brand: "Bose",            category: "Audio" },
];

import { ProductPricingService } from '../product-pricing/product-pricing.service';

export interface SeedResult {
    pricingConfigs: number;
    banners: number;
    gradeBanners: number;
    promoSlides: number;
    deviceCatalog: number;
    tradeInDevices: number;
    tradeInQuestions?: number;
    stores?: number;
    scrapedPrices?: number;
    autoPricedProducts?: number;
    others: { created: number; updated: number; errors: string[] };
    categories: number;
    brands: number;
    brandCategories: number;
    helplineSeeded: boolean;
    supportEmailSeeded: boolean;
    products: {
        created: number;
        updated: number;
        errors: string[];
        total: number;
    };
}

@Injectable()
export class SeedService {
    private readonly logger = new Logger(SeedService.name);
    private readonly s3Client: S3Client;
    private readonly bucketName: string;
    private readonly downloadsDir: string;
    private readonly seedDir: string;

    constructor(
        private readonly prisma: PrismaService,
        private readonly settingsService: SettingsService,
        private readonly tradeInQuestionsService: TradeInQuestionsService,
        private readonly productPricingService: ProductPricingService,
    ) {
        this.bucketName = process.env.GARAGE_BUCKET || 'ai-ecommerce';
        this.s3Client = new S3Client({
            region: 'us-east-1',
            endpoint: process.env.GARAGE_ENDPOINT || 'http://localhost:9000',
            credentials: {
                accessKeyId: process.env.GARAGE_ACCESS_KEY || 'minioadmin',
                secretAccessKey: process.env.GARAGE_SECRET_KEY || 'minioadmin',
            },
            forcePathStyle: true,
        });
        this.downloadsDir = path.join(process.cwd(), 'prisma', 'seed', 'products');
        this.seedDir      = path.join(process.cwd(), 'prisma', 'seed');
    }

    // Upload any local file to S3 at the given key. Returns key or null if file missing.
    private async uploadLocalFile(localPath: string, s3Key: string): Promise<string | null> {
        if (!fs.existsSync(localPath)) return null;
        const buffer = fs.readFileSync(localPath);
        const ext = path.extname(localPath).toLowerCase();
        const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
                   : ext === '.png' ? 'image/png'
                   : ext === '.webp' ? 'image/webp'
                   : 'application/octet-stream';
        await this.s3Client.send(new PutObjectCommand({
            Bucket: this.bucketName,
            Key:    s3Key,
            Body:   buffer,
            ContentType: mime,
        }));

        // PutObjectCommand has been observed to resolve without throwing while the
        // object was never actually persisted (a local Garage/MinIO flakiness) —
        // confirming the object is really there before the caller creates a DB row
        // pointing at it avoids a repeat of that exact orphaned-row state.
        try {
            await this.s3Client.send(new HeadObjectCommand({ Bucket: this.bucketName, Key: s3Key }));
        } catch (err) {
            this.logger.warn(`Upload of ${s3Key} reported success but object is not retrievable: ${err instanceof Error ? err.message : err}`);
            return null;
        }
        return s3Key;
    }

    async runSeed(): Promise<SeedResult> {
        const productsJsonPath = path.join(this.downloadsDir, 'products.json');
        if (!fs.existsSync(productsJsonPath)) {
            throw new Error(`products.json not found at ${productsJsonPath}.`);
        }

        const productsData: any[] = JSON.parse(fs.readFileSync(productsJsonPath, 'utf8'));
        this.logger.log(`Loaded ${productsData.length} products from products.json`);

        const pricingCount   = await this.seedPricingConfigs();
        const bannerCount    = await this.seedBanners();
        const gradeBannerCount = await this.seedGradeBanners();
        const slideCount     = await this.seedPromoSlides();
        const deviceCount    = await this.seedCatalogFromFolder();
        const tradeInDevicesCount = await this.seedTradeInDevices();
        const tradeInQuestionsResult = await this.tradeInQuestionsService.seedDefaults();
        const storesCount    = await this.seedStores();
        const productsResult = await this.seedProducts(productsData);
        const othersResult   = await this.seedOthers();
        const helplineSeeded    = await this.seedHelplines();
        const supportEmailSeeded = await this.seedSupportEmail();
        const scrapedPricesCount = await this.seedScrapedPrices();

        // Run auto-pricing calculation so all catalog products get calculated prices, comparePrice retail values, and auto_priced status
        try {
            await this.productPricingService.runPriceCatalog();
        } catch (err) {
            this.logger.warn(`Failed to auto-price catalog during seed: ${err instanceof Error ? err.message : err}`);
        }
        const autoPricedCount = await this.prisma.product.count({ where: { pricingStatus: 'auto_priced' } });

        const categoryCount      = await this.prisma.category.count();
        const brandCount         = await this.prisma.brand.count();
        const brandCategoryCount = await this.prisma.brandCategory.count();

        return {
            pricingConfigs: pricingCount,
            banners: bannerCount,
            gradeBanners: gradeBannerCount,
            promoSlides: slideCount,
            deviceCatalog: deviceCount,
            tradeInDevices: tradeInDevicesCount,
            tradeInQuestions: tradeInQuestionsResult.seeded,
            stores: storesCount,
            scrapedPrices: scrapedPricesCount,
            autoPricedProducts: autoPricedCount,
            others: othersResult,
            products: productsResult,
            categories: categoryCount,
            brands: brandCount,
            brandCategories: brandCategoryCount,
            helplineSeeded,
            supportEmailSeeded,
        };
    }

    private async seedScrapedPrices(): Promise<number> {
        const DEFAULT_BENCHMARKS: Array<{
            brand: string;
            model: string;
            storage: string;
            ram?: string;
            marketPrice: number;
            cexSellPrice?: number;
            envirofonePrice?: number;
            backMarketPrice?: number;
        }> = [
            // Apple iPhones
            { brand: 'Apple', model: 'iPhone 11', storage: '64GB', marketPrice: 199, cexSellPrice: 199, envirofonePrice: 185, backMarketPrice: 195 },
            { brand: 'Apple', model: 'iPhone 11', storage: '128GB', marketPrice: 229, cexSellPrice: 229, envirofonePrice: 215, backMarketPrice: 225 },
            { brand: 'Apple', model: 'iPhone 11 Pro', storage: '64GB', marketPrice: 249, cexSellPrice: 249, envirofonePrice: 235, backMarketPrice: 245 },
            { brand: 'Apple', model: 'iPhone 11 Pro Max', storage: '64GB', marketPrice: 289, cexSellPrice: 289, envirofonePrice: 275, backMarketPrice: 285 },
            { brand: 'Apple', model: 'iPhone 12', storage: '64GB', marketPrice: 269, cexSellPrice: 269, envirofonePrice: 255, backMarketPrice: 265 },
            { brand: 'Apple', model: 'iPhone 12', storage: '128GB', marketPrice: 299, cexSellPrice: 299, envirofonePrice: 285, backMarketPrice: 295 },
            { brand: 'Apple', model: 'iPhone 12 Mini', storage: '64GB', marketPrice: 239, cexSellPrice: 239, envirofonePrice: 225, backMarketPrice: 235 },
            { brand: 'Apple', model: 'iPhone 12 Pro', storage: '128GB', marketPrice: 349, cexSellPrice: 349, envirofonePrice: 335, backMarketPrice: 345 },
            { brand: 'Apple', model: 'iPhone 12 Pro Max', storage: '128GB', marketPrice: 399, cexSellPrice: 399, envirofonePrice: 385, backMarketPrice: 395 },
            { brand: 'Apple', model: 'iPhone 13', storage: '128GB', marketPrice: 399, cexSellPrice: 399, envirofonePrice: 385, backMarketPrice: 395 },
            { brand: 'Apple', model: 'iPhone 13', storage: '256GB', marketPrice: 449, cexSellPrice: 449, envirofonePrice: 435, backMarketPrice: 445 },
            { brand: 'Apple', model: 'iPhone 13 Mini', storage: '128GB', marketPrice: 329, cexSellPrice: 329, envirofonePrice: 315, backMarketPrice: 325 },
            { brand: 'Apple', model: 'iPhone 13 Pro', storage: '128GB', marketPrice: 489, cexSellPrice: 489, envirofonePrice: 475, backMarketPrice: 485 },
            { brand: 'Apple', model: 'iPhone 13 Pro Max', storage: '128GB', marketPrice: 549, cexSellPrice: 549, envirofonePrice: 535, backMarketPrice: 545 },
            { brand: 'Apple', model: 'iPhone 14', storage: '128GB', marketPrice: 479, cexSellPrice: 479, envirofonePrice: 465, backMarketPrice: 475 },
            { brand: 'Apple', model: 'iPhone 14 Plus', storage: '128GB', marketPrice: 529, cexSellPrice: 529, envirofonePrice: 515, backMarketPrice: 525 },
            { brand: 'Apple', model: 'iPhone 14 Pro', storage: '128GB', marketPrice: 599, cexSellPrice: 599, envirofonePrice: 585, backMarketPrice: 595 },
            { brand: 'Apple', model: 'iPhone 14 Pro Max', storage: '128GB', marketPrice: 669, cexSellPrice: 669, envirofonePrice: 655, backMarketPrice: 665 },
            { brand: 'Apple', model: 'iPhone 15', storage: '128GB', marketPrice: 599, cexSellPrice: 599, envirofonePrice: 585, backMarketPrice: 595 },
            { brand: 'Apple', model: 'iPhone 15 Plus', storage: '128GB', marketPrice: 669, cexSellPrice: 669, envirofonePrice: 655, backMarketPrice: 665 },
            { brand: 'Apple', model: 'iPhone 15 Pro', storage: '128GB', marketPrice: 749, cexSellPrice: 749, envirofonePrice: 735, backMarketPrice: 745 },
            { brand: 'Apple', model: 'iPhone 15 Pro Max', storage: '256GB', marketPrice: 879, cexSellPrice: 879, envirofonePrice: 865, backMarketPrice: 875 },
            // iPads
            { brand: 'Apple', model: 'iPad Mini 6th Gen', storage: '64GB', marketPrice: 349, cexSellPrice: 349, envirofonePrice: 335, backMarketPrice: 345 },
            { brand: 'Apple', model: 'iPad Pro 11-inch M1', storage: '128GB', marketPrice: 499, cexSellPrice: 499, envirofonePrice: 485, backMarketPrice: 495 },
            // Gaming
            { brand: 'Sony', model: 'PlayStation 5', storage: '825GB', marketPrice: 379, cexSellPrice: 379, envirofonePrice: 365, backMarketPrice: 375 },
            { brand: 'Microsoft', model: 'Xbox One X', storage: '1TB', marketPrice: 159, cexSellPrice: 159, envirofonePrice: 145, backMarketPrice: 155 },
            { brand: 'Microsoft', model: 'Xbox One S', storage: '500GB', marketPrice: 119, cexSellPrice: 119, envirofonePrice: 110, backMarketPrice: 115 },
            { brand: 'Microsoft', model: 'Xbox One S', storage: '1TB', marketPrice: 139, cexSellPrice: 139, envirofonePrice: 130, backMarketPrice: 135 },
            { brand: 'Microsoft', model: 'Xbox One S', storage: '2TB', marketPrice: 169, cexSellPrice: 169, envirofonePrice: 160, backMarketPrice: 165 },
            // Samsung
            { brand: 'Samsung', model: 'Galaxy S21', storage: '128GB', marketPrice: 229, cexSellPrice: 229, envirofonePrice: 215, backMarketPrice: 225 },
            { brand: 'Samsung', model: 'Galaxy S22', storage: '128GB', marketPrice: 319, cexSellPrice: 319, envirofonePrice: 305, backMarketPrice: 315 },
            { brand: 'Samsung', model: 'Galaxy S23', storage: '128GB', marketPrice: 439, cexSellPrice: 439, envirofonePrice: 425, backMarketPrice: 435 },
            { brand: 'Samsung', model: 'Galaxy S24', storage: '128GB', marketPrice: 579, cexSellPrice: 579, envirofonePrice: 565, backMarketPrice: 575 },
        ];

        let count = 0;
        for (const item of DEFAULT_BENCHMARKS) {
            const deviceKey = `${item.brand} ${item.model} ${item.storage}`.trim();
            await this.prisma.scrapedPrice.upsert({
                where: { deviceKey },
                update: {
                    brand: item.brand,
                    model: item.model,
                    storage: item.storage,
                    ram: item.ram ?? '',
                    marketPrice: item.marketPrice,
                    cexSellPrice: item.cexSellPrice ?? item.marketPrice,
                    envirofonePrice: item.envirofonePrice ?? item.marketPrice * 0.95,
                    backMarketPrice: item.backMarketPrice ?? item.marketPrice,
                },
                create: {
                    deviceKey,
                    brand: item.brand,
                    model: item.model,
                    storage: item.storage,
                    ram: item.ram ?? '',
                    marketPrice: item.marketPrice,
                    cexSellPrice: item.cexSellPrice ?? item.marketPrice,
                    envirofonePrice: item.envirofonePrice ?? item.marketPrice * 0.95,
                    backMarketPrice: item.backMarketPrice ?? item.marketPrice,
                },
            });
            count++;
        }
        this.logger.log(`Seeded ${count} default scraped market prices`);
        return count;
    }

    private async seedStores(): Promise<number> {
        let seeded = 0;
        const DEFAULT_STORES = [
            {
                name: 'TechStop Leicester',
                address: '148B Melton Rd',
                city: 'Leicester',
                postcode: 'LE4 5EE',
                phone: '+447343055398',
                openingHours: 'Mon–Sat, 9:00 AM – 6:00 PM',
                mapsEmbedUrl: 'https://maps.google.com/maps?q=148B+Melton+Rd,+Leicester+LE4+5EE&t=&z=15&ie=UTF8&iwloc=&output=embed',
                isActive: true,
            },
        ];
        for (const store of DEFAULT_STORES) {
            const existing = await this.prisma.store.findFirst({
                where: { postcode: store.postcode, name: store.name },
            });
            if (!existing) {
                await this.prisma.store.create({ data: store });
                seeded++;
            }
        }
        if (seeded > 0) {
            this.logger.log(`Seeded ${seeded} default store location(s)`);
        }
        return seeded;
    }

    // ─── Support contact info (helpline + email) ─────────────────────────────
    // Only fill these in when completely unset — unlike the rest of this seed,
    // an admin editing these afterward (Admin → Helplines) is real customization
    // that a repeat "Run Full Seed" click should never silently overwrite.

    private async seedHelplines(): Promise<boolean> {
        const existingCount = await this.prisma.helplineNumber.count();
        if (existingCount > 0) return false;
        await this.prisma.helplineNumber.create({
            data: { label: 'Leicester Store Helpline', number: '+447343055398', isActive: true, order: 0 },
        });
        this.logger.log('Seeded default helpline number');
        return true;
    }

    private async seedSupportEmail(): Promise<boolean> {
        const existing = await this.settingsService.get('SUPPORT_EMAIL');
        if (existing) return false;
        await this.settingsService.set('SUPPORT_EMAIL', 'techstopuk@outlook.com');
        this.logger.log('Seeded default support email');
        return true;
    }

    // ─── Purge: wipe ALL data from DB and every object in Garage ────────────
    async purgeAll(): Promise<{
        deleted: number;
        counts: {
            orderItems: number;
            orders: number;
            tradeIns: number;
            repairs: number;
            reviews: number;
            scraperRuns: number;
            scrapedPrices: number;
            products: number;
            otherBrands: number;
            otherSubcategories: number;
            deviceCatalog: number;
            tradeInDevices: number;
            tradeInQuestions: number;
            brandCategories: number;
            categories: number;
            brands: number;
            banners: number;
            gradeBanners: number;
            promoSlides: number;
            pricingConfigs: number;
            helplines: number;
            notifications: number;
            supportChats: number;
            stores: number;
            supportEmailCleared: boolean;
        }
    }> {
        // 1. Nuclear Garage wipe — list every object in the bucket and delete all.
        //    This is intentionally NOT keyed off DB records so orphaned files
        //    (trade-in images, repair images, old seeds) are also removed.
        let s3Deleted = 0;
        let continuationToken: string | undefined;
        do {
            const listResult = await this.s3Client.send(new ListObjectsV2Command({
                Bucket: this.bucketName,
                ContinuationToken: continuationToken,
                MaxKeys: 1000,
            }));
            const objects = listResult.Contents ?? [];
            if (objects.length > 0) {
                const deleteResult = await this.s3Client.send(new DeleteObjectsCommand({
                    Bucket: this.bucketName,
                    Delete: { Objects: objects.map(o => ({ Key: o.Key! })) },
                }));
                s3Deleted += objects.length;
                for (const err of deleteResult.Errors ?? []) {
                    this.logger.warn(`Garage delete error — key="${err.Key}" code=${err.Code}: ${err.Message}`);
                }
            }
            continuationToken = listResult.IsTruncated ? listResult.NextContinuationToken : undefined;
        } while (continuationToken);
        this.logger.log(`Garage purged — deleted ${s3Deleted} objects from bucket "${this.bucketName}"`);

        // 2. Wipe DB in FK-safe order and track counts
        const orderItems            = await this.prisma.orderItem.deleteMany({});
        const orders                = await this.prisma.order.deleteMany({});
        const tradeIns              = await this.prisma.tradeIn.deleteMany({});
        const repairs               = await this.prisma.repair.deleteMany({});
        const reviews               = await this.prisma.review.deleteMany({});
        const chatMessages          = await this.prisma.chatMessage.deleteMany({});
        const supportChats          = await this.prisma.supportChat.deleteMany({});
        const notifications         = await this.prisma.notification.deleteMany({});
        const scraperRuns           = await this.prisma.scraperRun.deleteMany({});
        const scrapedPrices         = await this.prisma.scrapedPrice.deleteMany({});
        const productsDeleted       = await this.prisma.product.deleteMany({});
        const otherBrandsDeleted    = await this.prisma.otherBrand.deleteMany({});
        const otherSubsDeleted      = await this.prisma.otherSubcategory.deleteMany({});
        const tradeInDevicesDeleted  = await this.prisma.tradeInDevice.deleteMany({});
        const tradeInQuestionsDel   = await this.prisma.tradeInQuestion.deleteMany({});
        const deviceCatalogDeleted  = await this.prisma.deviceCatalog.deleteMany({});
        const brandCatsDeleted      = await this.prisma.brandCategory.deleteMany({});
        const categoriesDeleted     = await this.prisma.category.deleteMany({});
        const brandsDeleted         = await this.prisma.brand.deleteMany({});
        const bannersDeleted        = await this.prisma.banner.deleteMany({});
        const gradeBannersDeleted   = await this.prisma.gradeBanner.deleteMany({});
        const promoSlidesDeleted    = await this.prisma.promoSlide.deleteMany({});
        const pricingDeleted        = await this.prisma.pricingConfig.deleteMany({});
        const helplinesDeleted      = await this.prisma.helplineNumber.deleteMany({});
        const storesDeleted         = await this.prisma.store.deleteMany({});
        const hadSupportEmail       = (await this.settingsService.get('SUPPORT_EMAIL')) !== null;
        await this.settingsService.remove('SUPPORT_EMAIL');

        this.logger.log('Database purged — all tables cleared');
        return {
            deleted: s3Deleted,
            counts: {
                orderItems:         orderItems.count,
                orders:             orders.count,
                tradeIns:           tradeIns.count,
                repairs:            repairs.count,
                reviews:            reviews.count,
                scraperRuns:        scraperRuns.count,
                scrapedPrices:      scrapedPrices.count,
                products:           productsDeleted.count,
                otherBrands:        otherBrandsDeleted.count,
                otherSubcategories: otherSubsDeleted.count,
                deviceCatalog:      deviceCatalogDeleted.count,
                tradeInDevices:     tradeInDevicesDeleted.count,
                tradeInQuestions:   tradeInQuestionsDel.count,
                brandCategories:    brandCatsDeleted.count,
                categories:         categoriesDeleted.count,
                brands:             brandsDeleted.count,
                banners:            bannersDeleted.count,
                gradeBanners:       gradeBannersDeleted.count,
                promoSlides:        promoSlidesDeleted.count,
                pricingConfigs:     pricingDeleted.count,
                helplines:          helplinesDeleted.count,
                notifications:      notifications.count,
                supportChats:       supportChats.count,
                stores:             storesDeleted.count,
                supportEmailCleared: hadSupportEmail,
            },
        };
    }

    private async seedTradeInDevices(): Promise<number> {
        let count = 0;
        for (const device of TRADE_IN_DEVICES_SEED) {
            await this.prisma.tradeInDevice.upsert({
                where:  { brand_name: { brand: device.brand, name: device.name } },
                update: { category: device.category, isActive: true },
                create: { name: device.name, brand: device.brand, category: device.category, isActive: true },
            });
            count++;
        }
        this.logger.log(`Seeded ${count} Trade-In search devices (Other Search Devices)`);
        return count;
    }

    private async seedPricingConfigs(): Promise<number> {
        for (const config of PRICING_DEFAULTS) {
            await this.prisma.pricingConfig.upsert({
                where: { key: config.key },
                update: { value: config.value, label: config.label },
                create: config,
            });
        }
        return PRICING_DEFAULTS.length;
    }

    // ─── Dynamic catalog seed from seed/categories/ folder ────────────────────

    private async seedCatalogFromFolder(): Promise<number> {
        await this.prisma.orderItem.deleteMany({});
        await this.prisma.product.deleteMany({});
        await this.prisma.deviceCatalog.deleteMany({});

        const categoriesDir = path.join(this.seedDir, 'categories');
        if (!fs.existsSync(categoriesDir)) {
            this.logger.warn('seed/categories/ not found — skipping catalog image seed');
        } else {
            await this.seedCatalogImages(categoriesDir);
        }

        // Upload brand logos from seed/brands/{slug}/logo.png
        await this.seedBrandLogos();

        // Seed the device catalog (models + storage)
        const bcCache = new Map<string, string>();

        for (const dev of DEVICE_CATALOG) {
            const brandSlug    = dev.brand.toLowerCase().replace(/[^a-z0-9]+/g, '-');
            const categorySlug = dev.category;

            const brand = await this.prisma.brand.upsert({
                where: { slug: brandSlug },
                update: {},
                create: { name: dev.brand, slug: brandSlug },
            });
            const catName = capitalize(categorySlug);
            const cat = await this.prisma.category.upsert({
                where: { name: catName },
                update: { ...categoryFlags(categorySlug), ...categoryMeta(categorySlug) },
                create: { name: catName, ...categoryFlags(categorySlug), ...categoryMeta(categorySlug) },
            });

            const bcKey = `${brand.id}::${cat.id}`;
            if (!bcCache.has(bcKey)) {
                const bc = await this.prisma.brandCategory.upsert({
                    where: { brandId_categoryId: { brandId: brand.id, categoryId: cat.id } },
                    update: {},
                    create: { brandId: brand.id, categoryId: cat.id, images: [] },
                });
                bcCache.set(bcKey, bc.id);
            }

            await this.prisma.deviceCatalog.create({
                data: {
                    brandCategoryId: bcCache.get(bcKey)!,
                    model: dev.model,
                    storageOptions: dev.storageOptions,
                    attributeOptions: (dev as { attributeOptions?: unknown }).attributeOptions ?? [],
                    isActive: true,
                },
            });
        }
        this.logger.log(`Seeded ${DEVICE_CATALOG.length} device catalog entries`);
        return DEVICE_CATALOG.length;
    }

    // Scan seed/categories/{slug}/ — root images → category hero, subfolders → brand-category images
    private async seedCatalogImages(categoriesDir: string) {
        const catFolders = fs.readdirSync(categoriesDir).filter(d =>
            fs.statSync(path.join(categoriesDir, d)).isDirectory(),
        );

        for (const categorySlug of catFolders) {
            const catDir = path.join(categoriesDir, categorySlug);

            // Upsert category
            const catNameFromSlug = capitalize(categorySlug);
            let cat = await this.prisma.category.upsert({
                where: { name: catNameFromSlug },
                update: { ...categoryFlags(categorySlug), ...categoryMeta(categorySlug) },
                create: { name: catNameFromSlug, ...categoryFlags(categorySlug), ...categoryMeta(categorySlug) },
            });

            // Root-level images → category hero (first one) + gallery (all of them).
            // The admin catalog-mgmt Categories page renders its "Images" column from
            // `images` (the gallery array), not `image` (the hero) — only ever setting
            // the hero left that column permanently empty even though seeding succeeded.
            if (!cat.image) {
                const rootImages = fs.readdirSync(catDir)
                    .filter(f => isImageFile(f) && fs.statSync(path.join(catDir, f)).isFile());
                if (rootImages.length > 0) {
                    const uploadedKeys: string[] = [];
                    for (const img of rootImages) {
                        const s3Key = `catalog/categories/${categorySlug}/${img}`;
                        const uploaded = await this.uploadLocalFile(path.join(catDir, img), s3Key);
                        if (uploaded) uploadedKeys.push(uploaded);
                    }
                    if (uploadedKeys.length > 0) {
                        cat = await this.prisma.category.update({
                            where: { id: cat.id },
                            data: { image: uploadedKeys[0], images: uploadedKeys },
                        });
                        this.logger.log(`  Category images: ${categorySlug} (${uploadedKeys.length})`);
                    }
                }
            }

            // Subfolders → brand-category images (e.g. "apple[iphone]", "sony[playstation]")
            const brandFolders = fs.readdirSync(catDir).filter(d =>
                fs.statSync(path.join(catDir, d)).isDirectory(),
            );

            for (const brandFolder of brandFolders) {
                const { slug: brandSlug, alias } = parseBrandFolderName(brandFolder);
                const brandDir  = path.join(catDir, brandFolder);
                // S3 subfolder uses alias if present (e.g. "xbox"), otherwise slug
                const s3BrandPath = alias ?? brandSlug;

                const brand = await this.prisma.brand.upsert({
                    where: { slug: brandSlug },
                    update: {},
                    create: { name: capitalize(brandSlug), slug: brandSlug },
                });

                const bc = await this.prisma.brandCategory.upsert({
                    where: { brandId_categoryId: { brandId: brand.id, categoryId: cat.id } },
                    update: { alias },
                    create: { brandId: brand.id, categoryId: cat.id, alias, images: [] },
                });

                const existingImages = (bc.images as string[]) ?? [];
                if (existingImages.length === 0) {
                    const imgs = fs.readdirSync(brandDir).filter(isImageFile);
                    const keys: string[] = [];
                    for (const img of imgs) {
                        const s3Key = `catalog/categories/${categorySlug}/${s3BrandPath}/${img}`;
                        const uploaded = await this.uploadLocalFile(path.join(brandDir, img), s3Key);
                        if (uploaded) keys.push(uploaded);
                    }
                    if (keys.length) {
                        await this.prisma.brandCategory.update({ where: { id: bc.id }, data: { images: keys } });
                        this.logger.log(`  ${keys.length} images → catalog/${categorySlug}/${s3BrandPath}/`);
                    }
                }
            }
        }
    }

    // Scan seed/brands/{slug}/ — upload logo.png as brand logo, other images as brand images
    private async seedBrandLogos() {
        const brandsDir = path.join(this.seedDir, 'brands');
        if (!fs.existsSync(brandsDir)) return;

        const dirs = fs.readdirSync(brandsDir).filter(d =>
            fs.statSync(path.join(brandsDir, d)).isDirectory(),
        );

        for (const brandSlug of dirs) {
            const brandDir = path.join(brandsDir, brandSlug);
            const brand = await this.prisma.brand.findUnique({ where: { slug: brandSlug } });
            if (!brand) continue;

            const allImages = fs.readdirSync(brandDir).filter(isImageFile);

            for (const filename of allImages) {
                const localPath = path.join(brandDir, filename);
                const s3Key = `catalog/brands/${brandSlug}/${filename}`;
                const uploaded = await this.uploadLocalFile(localPath, s3Key);
                if (!uploaded) continue;

                if (filename === 'logo.png' && !brand.logo) {
                    await this.prisma.brand.update({ where: { id: brand.id }, data: { logo: uploaded } });
                    this.logger.log(`  Logo → catalog/brands/${brandSlug}/logo.png`);
                }
            }
        }
    }

    // ─── Banners ──────────────────────────────────────────────────────────────

    private async seedBanners(): Promise<number> {
        const bannersDir = path.join(this.seedDir, 'banners');
        if (!fs.existsSync(bannersDir)) return 0;

        // Only root-level images (skip promo_banners/ subfolder)
        const files = fs.readdirSync(bannersDir)
            .filter(f => isImageFile(f) && fs.statSync(path.join(bannersDir, f)).isFile());
        let count = 0;

        for (let i = 0; i < files.length; i++) {
            const filename = files[i]!;
            const s3Key = `banners/${filename}`;
            const existing = await this.prisma.banner.findUnique({ where: { key: s3Key } });
            if (!existing) {
                const uploaded = await this.uploadLocalFile(path.join(bannersDir, filename), s3Key);
                if (uploaded) {
                    await this.prisma.banner.create({
                        data: { key: uploaded, label: filename.replace(/\.[^.]+$/, ''), order: i },
                    });
                    count++;
                    this.logger.log(`  Banner: ${filename}`);
                }
            }
        }
        this.logger.log(`Seeded ${count} background banners`);
        return count;
    }

    // ─── Grade guide banners ────────────────────────────────────────────────────

    private async seedGradeBanners(): Promise<number> {
        const gradeDir = path.join(this.seedDir, 'banners', 'Grade');
        if (!fs.existsSync(gradeDir)) return 0;

        const files = fs.readdirSync(gradeDir)
            .filter(f => isImageFile(f) && fs.statSync(path.join(gradeDir, f)).isFile());
        let count = 0;

        for (const filename of files) {
            // Filenames are "<grade>_<n>.png" — e.g. a_1.png, new_2.png.
            const gradePrefix = filename.split('_')[0]?.toLowerCase() ?? '';
            const grade = gradePrefix === 'new' ? 'NEW' : gradePrefix.toUpperCase();
            if (!['NEW', 'A', 'B', 'C', 'F'].includes(grade)) continue;

            const s3Key = `banners/grade/${gradePrefix}/${filename}`;
            const existing = await this.prisma.gradeBanner.findUnique({ where: { key: s3Key } });

            // A DB row alone doesn't guarantee the object is still in storage — local
            // Garage/MinIO volumes aren't persistent across restarts, so a row can
            // outlive its object. Verify before trusting it, otherwise re-seeding can
            // never repair a banner that lost its underlying file.
            if (existing) {
                try {
                    await this.s3Client.send(new HeadObjectCommand({ Bucket: this.bucketName, Key: s3Key }));
                    continue;
                } catch {
                    // object missing despite the DB row — fall through and re-upload
                }
            }

            const uploaded = await this.uploadLocalFile(path.join(gradeDir, filename), s3Key);
            if (uploaded) {
                if (!existing) {
                    await this.prisma.gradeBanner.create({
                        data: { grade, key: uploaded, label: filename.replace(/\.[^.]+$/, ''), isActive: true, order: 0 },
                    });
                }
                count++;
                this.logger.log(`  Grade banner: ${filename}`);
            }
        }
        this.logger.log(`Seeded ${count} grade guide banners`);
        return count;
    }

    // ─── Promo slides ─────────────────────────────────────────────────────────

    private async seedPromoSlides(): Promise<number> {
        const slidesJsonPath = path.join(this.seedDir, 'banners', 'promo_banners', 'slides.json');
        if (!fs.existsSync(slidesJsonPath)) return 0;

        const promoDir = path.join(this.seedDir, 'banners', 'promo_banners');
        const raw: any[] = JSON.parse(fs.readFileSync(slidesJsonPath, 'utf8'));
        let count = 0;

        for (let i = 0; i < raw.length; i++) {
            const slide = raw[i]!;
            const imgFilename: string = slide.img ?? '';

            // Upload image if present
            let imgKey: string | null = null;
            if (imgFilename) {
                const localPath = path.join(promoDir, imgFilename);
                const s3Key = `banners/promo/${imgFilename}`;
                imgKey = await this.uploadLocalFile(localPath, s3Key);
                if (imgKey) this.logger.log(`  Promo image: ${imgFilename}`);
            }

            // Map all fields from slides.json to the DB model
            const slideData = {
                imgKey:      imgKey ?? null,
                tabTitle:    slide.tabTitle    ?? '',
                tag:         slide.tag         ?? '',
                titleLine1:  slide.titleLine1  ?? '',
                titleLine2:  slide.titleLine2  ?? '',
                titleItalic: slide.titleItalic ?? '',
                title:       [slide.titleLine1, slide.titleLine2].filter(Boolean).join(' '),
                subtitle:    slide.desc        ?? '',
                badgeA:      slide.badgeA      ?? '',
                badgeB:      slide.badgeB      ?? '',
                specs:       Array.isArray(slide.specs) ? slide.specs.join(',') : (slide.specs ?? ''),
                themeColor:  slide.themeColor  ?? 'from-blue-500 to-indigo-600',
                bgGlow:      slide.bgGlow      ?? 'rgba(59,130,246,0.15)',
                btnText:     slide.btnText     ?? 'Shop Now',
                btnLink:     slide.btnLink     ?? '/',
                isActive:    true,
            };

            // Upsert by order so re-seeding is idempotent
            const existing = await this.prisma.promoSlide.findFirst({ where: { order: i } });
            if (existing) {
                await this.prisma.promoSlide.update({
                    where: { id: existing.id },
                    data: { ...slideData, imgKey: imgKey ?? existing.imgKey },
                });
            } else {
                await this.prisma.promoSlide.create({
                    data: { ...slideData, order: i },
                });
                count++;
            }
        }
        this.logger.log(`Seeded ${count} promo slides`);
        return raw.length;
    }

    private async uploadImage(
        catSlug: string,
        brandSlug: string,
        deviceSlug: string,
        imageFilename: string,
    ): Promise<string> {
        const localPath = path.join(this.downloadsDir, imageFilename);
        if (!fs.existsSync(localPath)) throw new Error(`Image file not found: ${localPath}`);
        const s3Key = `products/${catSlug}/${brandSlug}/${deviceSlug}/${imageFilename}`;
        const buffer = fs.readFileSync(localPath);
        const ext = path.extname(imageFilename).toLowerCase();
        const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
                   : ext === '.png' ? 'image/png' : 'image/jpeg';
        await this.s3Client.send(new PutObjectCommand({
            Bucket: this.bucketName,
            Key: s3Key,
            Body: buffer,
            ContentType: mime,
        }));
        return s3Key;
    }

    // ─── Others (accessories, smartwatches, games, etc.) ─────────────────────
    // Uses OtherBrand + OtherSubcategory so these products appear on /products/others
    // and NOT in the main catalog.

    private async seedOthers(): Promise<{ created: number; updated: number; errors: string[] }> {
        const othersJsonPath = path.join(this.seedDir, 'others', 'products.json');
        if (!fs.existsSync(othersJsonPath)) {
            this.logger.warn('others/products.json not found — skipping');
            return { created: 0, updated: 0, errors: ['others/products.json not found'] };
        }

        const data: Record<string, any[]> = JSON.parse(fs.readFileSync(othersJsonPath, 'utf8'));

        const CAT_NAME: Record<string, string> = {
            cables:       'Cables',
            chargers:     'Chargers',
            films:        'Films',
            games:        'Games',
            graphics:     'Graphics Cards',
            lens:         'Camera Lenses',
            memory:       'Memory',
            mouse:        'Mouse & Peripherals',
            pen:          'Stylus & Pens',
            smart_watches:'Smartwatches',
            smartwatches: 'Smartwatches',
            storage:      'Storage',
        };

        const subcatCache = new Map<string, string>();
        const brandCache  = new Map<string, string>();

        let created = 0;
        let updated = 0;
        const errors: string[] = [];

        for (const [subcatKey, items] of Object.entries(data)) {
            const subcatName = CAT_NAME[subcatKey] ?? capitalize(subcatKey.replace(/_/g, ' '));

            for (const item of items) {
                try {
                    const brandName = item.brand as string;

                    if (!brandCache.has(brandName)) {
                        const existing = await this.prisma.otherBrand.findFirst({ where: { name: brandName } });
                        const ob = existing
                            ?? await this.prisma.otherBrand.create({ data: { name: brandName } });
                        brandCache.set(brandName, ob.id);
                    }
                    const otherBrandId = brandCache.get(brandName)!;

                    if (!subcatCache.has(subcatName)) {
                        const defaultIcon = (name: string) => {
                            const k = name.toLowerCase();
                            if (k.includes('storage') || k.includes('ssd') || k.includes('hdd') || k.includes('nvme')) return 'hard-drive';
                            if (k.includes('memory') || k.includes('ram') || k.includes('cpu')) return 'cpu';
                            if (k.includes('charger') || k.includes('cable') || k.includes('power')) return 'zap';
                            if (k.includes('watch') || k.includes('smartwatch')) return 'watch';
                            if (k.includes('graphic') || k.includes('gpu') || k.includes('monitor')) return 'monitor';
                            if (k.includes('pen') || k.includes('stylus')) return 'pen-tool';
                            if (k.includes('mouse') || k.includes('keyboard')) return 'mouse';
                            if (k.includes('audio') || k.includes('headphone') || k.includes('earbud')) return 'headphones';
                            if (k.includes('phone') || k.includes('mobile')) return 'smartphone';
                            if (k.includes('laptop') || k.includes('macbook')) return 'laptop';
                            if (k.includes('tablet') || k.includes('ipad')) return 'tablet';
                            if (k.includes('game') || k.includes('console')) return 'gamepad-2';
                            if (k.includes('camera') || k.includes('lens')) return 'camera';
                            if (k.includes('film') || k.includes('movie')) return 'film';
                            if (k.includes('disc')) return 'disc';
                            return 'package';
                        };
                        const existing = await this.prisma.otherSubcategory.findFirst({ where: { name: subcatName } });
                        let os: any = existing;
                        if (!existing) {
                            os = await this.prisma.otherSubcategory.create({ data: { name: subcatName, icon: defaultIcon(subcatName) } });
                        } else if (!existing.icon) {
                            os = await this.prisma.otherSubcategory.update({ where: { id: existing.id }, data: { icon: defaultIcon(subcatName) } });
                        }
                        subcatCache.set(subcatName, os.id);
                    }
                    const otherSubcategoryId = subcatCache.get(subcatName)!;

                    const imgPath: string = item.image ?? '';
                    const parts = imgPath.replace(/^\//, '').split('/');
                    const localImgPath = path.join(this.seedDir, ...parts);
                    let s3ImageKey: string | null = null;
                    if (fs.existsSync(localImgPath)) {
                        const s3Key = `products/${parts.slice(0, -1).join('/')}/${parts[parts.length - 1]}`;
                        s3ImageKey = await this.uploadLocalFile(localImgPath, s3Key);
                    }

                    const productData = {
                        otherBrandId,
                        otherSubcategoryId,
                        name:          item.name,
                        slug:          item.id,
                        condition:     'A',
                        storage:       '',
                        price:         typeof item.price === 'number' ? item.price : null,
                        comparePrice:  typeof item.comparePrice === 'number' ? item.comparePrice : null,
                        stock:         10,
                        images:        s3ImageKey ? [s3ImageKey] : [],
                        specs:         {},
                        description:   '',
                        rating:        0,
                        reviewCount:   0,
                        pricingStatus: 'manual',
                        isActive:      true,
                    };

                    const existing = await this.prisma.product.findUnique({ where: { slug: item.id } });
                    if (existing) {
                        await this.prisma.product.update({ where: { slug: item.id }, data: productData as never });
                        updated++;
                    } else {
                        await this.prisma.product.create({ data: productData as never });
                        created++;
                    }
                } catch (e: any) {
                    const msg = `${subcatKey}/${item.id}: ${e.message}`;
                    this.logger.error(`Failed to seed others/${msg}`);
                    errors.push(msg);
                }
            }
            this.logger.log(`  Others seeded: ${subcatKey} (${items.length} items)`);
        }

        this.logger.log(`Seeded ${created} others products (${updated} updated, ${errors.length} errors)`);
        return { created, updated, errors };
    }

    private normalizeCategory(raw: string): string {
        const map: Record<string, string> = {
            'phones': 'phones', 'tablets': 'tablets',
            'consoles': 'gaming', 'gaming': 'gaming', 'laptops': 'laptops',
            'audio': 'audio', 'accessories': 'accessories',
            'smartwatches': 'smartwatches', 'games': 'games', 'films': 'films',
            'laptops / macbooks': 'laptops',
        };
        return map[raw.toLowerCase()] ?? raw.toLowerCase();
    }

    private async seedProducts(productsData: any[]): Promise<SeedResult['products']> {
        let created = 0;
        let updated = 0;
        const errors: string[] = [];

        // Build brand::model → catalogId lookup from what was just seeded
        const catalogEntries = await this.prisma.deviceCatalog.findMany({
            select: { id: true, model: true, brandCategory: { include: { brand: true } } },
        });
        const catalogMap = new Map<string, string>(
            catalogEntries.map(e => [`${e.brandCategory.brand.name}::${e.model}`, e.id]),
        );

        for (const prod of productsData) {
            try {
                const brand = prod.brand as string;
                const model = prod.model as string;

                // Auto-create catalog entry if this brand/model isn't in the hardcoded list
                let catalogId = catalogMap.get(`${brand}::${model}`);
                if (!catalogId) {
                    const storage = (prod.specs?.Storage || prod.specs?.storage || '') as string;
                    const categorySlug = this.normalizeCategory(prod.category ?? 'phones');
                    const brandSlug = brand.toLowerCase().replace(/[^a-z0-9]+/g, '-');

                    const brandRecord = await this.prisma.brand.upsert({
                        where: { slug: brandSlug },
                        update: {},
                        create: { name: brand, slug: brandSlug },
                    });
                    const catName = categorySlug.charAt(0).toUpperCase() + categorySlug.slice(1);
                    const catRecord = await this.prisma.category.upsert({
                        where: { name: catName },
                        update: { ...categoryFlags(categorySlug), ...categoryMeta(categorySlug) },
                        create: { name: catName, ...categoryFlags(categorySlug), ...categoryMeta(categorySlug) },
                    });
                    const bc = await this.prisma.brandCategory.upsert({
                        where: { brandId_categoryId: { brandId: brandRecord.id, categoryId: catRecord.id } },
                        update: {},
                        create: { brandId: brandRecord.id, categoryId: catRecord.id, images: [] },
                    });

                    const entry = await this.prisma.deviceCatalog.upsert({
                        where: { brandCategoryId_model: { brandCategoryId: bc.id, model } },
                        update: {},
                        create: {
                            brandCategoryId: bc.id,
                            model,
                            storageOptions: storage ? [storage] : [],
                            isActive: true,
                        },
                    });
                    catalogId = entry.id;
                    catalogMap.set(`${brand}::${model}`, catalogId);
                }

                const slug = prod.slug as string;
                const storage = (prod.specs?.Storage || prod.specs?.storage || '') as string;
                const { Storage: _S, storage: _s, ...remainingSpecs } = prod.specs ?? {};

                const catSlug    = this.normalizeCategory(prod.category ?? 'phones');
                const brandSlug  = (brand as string).toLowerCase().replace(/[^a-z0-9]+/g, '-');
                const deviceSlug = (model as string).toLowerCase().replace(/[^a-z0-9]+/g, '-');

                const s3Keys: string[] = [];
                if (Array.isArray(prod.images)) {
                    for (const imgFilename of prod.images as string[]) {
                        try {
                            s3Keys.push(await this.uploadImage(catSlug, brandSlug, deviceSlug, imgFilename));
                        } catch (e: any) {
                            this.logger.warn(`Image skipped "${prod.name}" / "${imgFilename}": ${e.message}`);
                        }
                    }
                }

                const data = {
                    catalogId,
                    name: prod.name,
                    slug,
                    condition: prod.condition,
                    storage,
                    price: null,
                    comparePrice: null,
                    stock: Number(prod.stock ?? 10),
                    images: s3Keys.length > 0 ? s3Keys : (Array.isArray(prod.images) ? prod.images : []),
                    specs: remainingSpecs ?? {},
                    description: prod.description ?? '',
                    rating: Number(prod.rating ?? 0),
                    reviewCount: Number(prod.reviewCount ?? 0),
                    pricingStatus: 'no_data',
                    isActive: false,
                };

                const existing = await this.prisma.product.findUnique({ where: { slug } });
                if (existing) {
                    await this.prisma.product.update({ where: { slug }, data: data as never });
                    updated++;
                } else {
                    await this.prisma.product.create({ data: data as never });
                    created++;
                }

                if ((created + updated) % 10 === 0) {
                    this.logger.log(`Progress: ${created + updated}/${productsData.length}`);
                }
            } catch (e: any) {
                errors.push(`${prod.name ?? prod.slug}: ${e.message}`);
                this.logger.error(`Failed to seed "${prod.name}": ${e.message}`);
            }
        }

        this.logger.log(`Products seeded — created: ${created}, updated: ${updated}, errors: ${errors.length}`);
        return { created, updated, errors, total: productsData.length };
    }
}

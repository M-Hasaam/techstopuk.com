import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { BadRequestException, InternalServerErrorException, NotFoundException } from '@nestjs/common';

jest.mock('openai');

import OpenAI from 'openai';
import { TradeInsService } from './trade-ins.service';
import { PrismaService } from '../database/prisma.service';
import { StorageService } from '../../common/services/storage.service';
import { EmailService } from '../../common/services/email.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ShippingService } from '../shipping/shipping.service';
import { ScraperDataService } from '../scraper-data/scraper-data.service';
import { ProductPricingService } from '../product-pricing/product-pricing.service';

function makeTradeIn(overrides: Partial<any> = {}) {
    return {
        id: 'ti-1',
        reference: 'TI-1001',
        userId: 'user-1',
        brand: 'Apple',
        model: 'iPhone 13',
        category: 'Phones',
        specs: { storage: '128GB' },
        condition: 'A',
        answers: {},
        status: 'SUBMITTED',
        offerPrice: 100,
        counterOffer: null,
        fulfillment: 'dropoff',
        images: [],
        adminNotes: null,
        contact: { name: 'Jane Doe', email: 'jane@example.com', phone: '07000000000' },
        storeId: null,
        customerNotes: null,
        trackingNumber: null,
        ...overrides,
    };
}

describe('TradeInsService', () => {
    let service: TradeInsService;
    let prismaMock: any;
    let storageMock: any;
    let emailMock: any;
    let notificationsMock: any;
    let shippingMock: any;
    let scraperMock: any;
    let productPricingMock: any;
    let mockOpenAiCreate: jest.Mock<any>;

    beforeEach(async () => {
        prismaMock = {
            tradeIn: {
                create: jest.fn<() => Promise<any>>(),
                findMany: jest.fn<() => Promise<any>>().mockResolvedValue([]),
                count: jest.fn<() => Promise<any>>().mockResolvedValue(0),
                findUnique: jest.fn<() => Promise<any>>(),
                findFirst: jest.fn<() => Promise<any>>(),
                update: jest.fn<() => Promise<any>>(),
                deleteMany: jest.fn<() => Promise<any>>(),
            },
            user: { findUnique: jest.fn<() => Promise<any>>() },
            pricingConfig: { findUnique: jest.fn<() => Promise<any>>().mockResolvedValue(null) },
            product: { count: jest.fn<() => Promise<any>>().mockResolvedValue(0) },
        };
        storageMock = {
            generatePresignedUrl: jest.fn<(k: string) => Promise<any>>().mockImplementation(async (k: string) => `https://cdn/${k}`),
            deleteFiles: jest.fn<() => Promise<any>>(),
        };
        emailMock = {
            sendTradeInApproved: jest.fn<() => Promise<any>>(),
            sendTradeInRejected: jest.fn<() => Promise<any>>(),
            sendTradeInCounterOffer: jest.fn<() => Promise<any>>(),
        };
        notificationsMock = { create: jest.fn<() => Promise<any>>() };
        shippingMock = {
            generatePrepaidLabel: jest.fn<() => Promise<any>>().mockResolvedValue({ trackingNumber: 'TRACK1', labelPdf: Buffer.from('pdf') }),
            sendLabelEmail: jest.fn<() => Promise<any>>(),
        };
        scraperMock = {};
        productPricingMock = { getTradeInAnchor: jest.fn<() => Promise<any>>().mockResolvedValue(null) };

        mockOpenAiCreate = jest.fn();
        (OpenAI as unknown as jest.Mock<any>).mockImplementation(() => ({
            chat: { completions: { create: mockOpenAiCreate } },
        }));

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                TradeInsService,
                { provide: PrismaService, useValue: prismaMock },
                { provide: StorageService, useValue: storageMock },
                { provide: EmailService, useValue: emailMock },
                { provide: NotificationsService, useValue: notificationsMock },
                { provide: ShippingService, useValue: shippingMock },
                { provide: ScraperDataService, useValue: scraperMock },
                { provide: ProductPricingService, useValue: productPricingMock },
            ],
        }).compile();

        service = module.get<TradeInsService>(TradeInsService);
    });

    afterEach(() => {
        delete process.env.OPENAI_API_KEY;
        jest.clearAllMocks();
    });

    describe('submit', () => {
        it('uses the dto contact as-is when no userId is given', async () => {
            const dto = { contact: { name: 'Guest', email: 'g@example.com', phone: '1' } } as any;
            prismaMock.tradeIn.create.mockResolvedValueOnce(makeTradeIn());
            await service.submit(dto);
            const call = prismaMock.tradeIn.create.mock.calls[0][0];
            expect(call.data.contact).toBe(dto.contact);
            expect(call.data.userId).toBeUndefined();
        });

        it('builds contact from the user record when userId is given and user exists', async () => {
            prismaMock.user.findUnique.mockResolvedValueOnce({
                name: 'Real Name', email: 'real@example.com', phone: '0700', address: 'Addr', postcode: 'PC1',
            });
            const dto = { contact: { name: '', email: '', phone: '', address: '', postcode: '' } } as any;
            prismaMock.tradeIn.create.mockResolvedValueOnce(makeTradeIn());

            await service.submit(dto, 'user-1');

            const call = prismaMock.tradeIn.create.mock.calls[0][0];
            expect(call.data.contact).toEqual({
                name: 'Real Name', email: 'real@example.com', phone: '0700', address: 'Addr', postcode: 'PC1',
            });
            expect(call.data.userId).toBe('user-1');
        });

        it('falls back to dto contact fields when the user record has falsy fields', async () => {
            prismaMock.user.findUnique.mockResolvedValueOnce({ name: '', email: '', phone: '', address: '', postcode: '' });
            const dto = { contact: { name: 'Dto Name', email: 'dto@example.com', phone: '0711', address: 'Dto Addr', postcode: 'DTO1' } } as any;
            prismaMock.tradeIn.create.mockResolvedValueOnce(makeTradeIn());

            await service.submit(dto, 'user-1');

            const call = prismaMock.tradeIn.create.mock.calls[0][0];
            expect(call.data.contact).toEqual({
                name: 'Dto Name', email: 'dto@example.com', phone: '0711', address: 'Dto Addr', postcode: 'DTO1',
            });
        });

        it('keeps the dto contact when userId is given but the user does not exist', async () => {
            prismaMock.user.findUnique.mockResolvedValueOnce(null);
            const dto = { contact: { name: 'Guest', email: 'g@example.com', phone: '1' } } as any;
            prismaMock.tradeIn.create.mockResolvedValueOnce(makeTradeIn());

            await service.submit(dto, 'user-1');

            const call = prismaMock.tradeIn.create.mock.calls[0][0];
            expect(call.data.contact).toBe(dto.contact);
        });
    });

    describe('findAll', () => {
        it('applies status and search filters and computes pagination', async () => {
            prismaMock.tradeIn.findMany.mockResolvedValueOnce([makeTradeIn()]);
            prismaMock.tradeIn.count.mockResolvedValueOnce(1);

            const result = await service.findAll({ status: 'SUBMITTED', search: 'apple', page: 2, limit: 5 });

            const call = prismaMock.tradeIn.findMany.mock.calls[0][0];
            expect(call.where.status).toBe('SUBMITTED');
            expect(call.where.OR).toBeDefined();
            expect(call.skip).toBe(5);
            expect(result).toEqual({ items: [makeTradeIn()], total: 1, page: 2, limit: 5, pages: 1 });
        });

        it('defaults to page 1 / limit 20 with no filters', async () => {
            await service.findAll({});
            const call = prismaMock.tradeIn.findMany.mock.calls[0][0];
            expect(call.where).toEqual({});
            expect(call.skip).toBe(0);
            expect(call.take).toBe(20);
        });
    });

    describe('findById', () => {
        it('throws NotFoundException when the trade-in does not exist', async () => {
            prismaMock.tradeIn.findUnique.mockResolvedValueOnce(null);
            await expect(service.findById('missing')).rejects.toThrow(NotFoundException);
        });

        it('resolves presigned URLs for images, dropping ones that fail', async () => {
            prismaMock.tradeIn.findUnique.mockResolvedValueOnce(makeTradeIn({ images: ['a.jpg', 'b.jpg'] }));
            storageMock.generatePresignedUrl
                .mockImplementationOnce(async () => 'https://cdn/a.jpg')
                .mockImplementationOnce(async () => { throw new Error('fail'); });

            const result = await service.findById('ti-1');
            expect(result.images).toEqual(['https://cdn/a.jpg']);
        });
    });

    describe('findByReference', () => {
        it('throws NotFoundException when not found', async () => {
            prismaMock.tradeIn.findUnique.mockResolvedValueOnce(null);
            await expect(service.findByReference('TI-9999')).rejects.toThrow(NotFoundException);
        });

        it('returns the trade-in when found', async () => {
            const ti = makeTradeIn();
            prismaMock.tradeIn.findUnique.mockResolvedValueOnce(ti);
            const result = await service.findByReference('TI-1001');
            expect(result).toBe(ti);
        });
    });

    describe('findByIdForUser', () => {
        it('throws NotFoundException when not found for that user', async () => {
            prismaMock.tradeIn.findFirst.mockResolvedValueOnce(null);
            await expect(service.findByIdForUser('ti-1', 'user-1')).rejects.toThrow(NotFoundException);
        });

        it('resolves image URLs when found', async () => {
            prismaMock.tradeIn.findFirst.mockResolvedValueOnce(makeTradeIn({ images: ['a.jpg'] }));
            const result = await service.findByIdForUser('ti-1', 'user-1');
            expect(result.images).toEqual(['https://cdn/a.jpg']);
        });
    });

    describe('acceptCounterOffer', () => {
        it('throws NotFoundException when not found for that user', async () => {
            prismaMock.tradeIn.findFirst.mockResolvedValueOnce(null);
            await expect(service.acceptCounterOffer('ti-1', 'user-1')).rejects.toThrow(NotFoundException);
        });

        it('throws BadRequestException when status is not COUNTER_OFFERED', async () => {
            prismaMock.tradeIn.findFirst.mockResolvedValueOnce(makeTradeIn({ status: 'SUBMITTED' }));
            await expect(service.acceptCounterOffer('ti-1', 'user-1')).rejects.toThrow(BadRequestException);
        });

        it('approves with the counter offer amount', async () => {
            prismaMock.tradeIn.findFirst.mockResolvedValueOnce(makeTradeIn({ status: 'COUNTER_OFFERED', counterOffer: 150, offerPrice: 100 }));
            await service.acceptCounterOffer('ti-1', 'user-1');
            expect(prismaMock.tradeIn.update).toHaveBeenCalledWith({
                where: { id: 'ti-1' },
                data: { status: 'APPROVED', offerPrice: 150 },
            });
        });

        it('purchases and emails a shipping label when the accepted counter offer is a ship fulfillment', async () => {
            prismaMock.tradeIn.findFirst.mockResolvedValueOnce(
                makeTradeIn({ status: 'COUNTER_OFFERED', counterOffer: 150, offerPrice: 100, fulfillment: 'ship' }),
            );
            await service.acceptCounterOffer('ti-1', 'user-1');
            expect(shippingMock.generatePrepaidLabel).toHaveBeenCalled();
            expect(shippingMock.sendLabelEmail).toHaveBeenCalled();
        });

        it('does not attempt a shipping label for drop-off fulfillment', async () => {
            prismaMock.tradeIn.findFirst.mockResolvedValueOnce(
                makeTradeIn({ status: 'COUNTER_OFFERED', counterOffer: 150, offerPrice: 100, fulfillment: 'dropoff' }),
            );
            await service.acceptCounterOffer('ti-1', 'user-1');
            expect(shippingMock.generatePrepaidLabel).not.toHaveBeenCalled();
        });
    });

    describe('declineCounterOffer', () => {
        it('throws NotFoundException when not found for that user', async () => {
            prismaMock.tradeIn.findFirst.mockResolvedValueOnce(null);
            await expect(service.declineCounterOffer('ti-1', 'user-1')).rejects.toThrow(NotFoundException);
        });

        it('throws BadRequestException when status is not COUNTER_OFFERED', async () => {
            prismaMock.tradeIn.findFirst.mockResolvedValueOnce(makeTradeIn({ status: 'SUBMITTED' }));
            await expect(service.declineCounterOffer('ti-1', 'user-1')).rejects.toThrow(BadRequestException);
        });

        it('cancels the trade-in', async () => {
            prismaMock.tradeIn.findFirst.mockResolvedValueOnce(makeTradeIn({ status: 'COUNTER_OFFERED' }));
            await service.declineCounterOffer('ti-1', 'user-1');
            expect(prismaMock.tradeIn.update).toHaveBeenCalledWith({ where: { id: 'ti-1' }, data: { status: 'CANCELLED' } });
        });
    });

    // Guests have no account, so these are the only way they can respond to a
    // counter-offer — reached via the link in their email, keyed off the reference
    // rather than a userId.
    describe('acceptCounterOfferByReference', () => {
        it('throws NotFoundException when no trade-in has that reference', async () => {
            prismaMock.tradeIn.findUnique.mockResolvedValueOnce(null);
            await expect(service.acceptCounterOfferByReference('TI-9999')).rejects.toThrow(NotFoundException);
        });

        it('throws BadRequestException when status is not COUNTER_OFFERED', async () => {
            prismaMock.tradeIn.findUnique.mockResolvedValueOnce(makeTradeIn({ status: 'SUBMITTED' }));
            await expect(service.acceptCounterOfferByReference('TI-1001')).rejects.toThrow(BadRequestException);
        });

        it('approves with the counter offer amount, looked up by reference alone', async () => {
            prismaMock.tradeIn.findUnique.mockResolvedValueOnce(makeTradeIn({ status: 'COUNTER_OFFERED', counterOffer: 150, offerPrice: 100, userId: null }));
            await service.acceptCounterOfferByReference('TI-1001');
            expect(prismaMock.tradeIn.update).toHaveBeenCalledWith({
                where: { id: 'ti-1' },
                data: { status: 'APPROVED', offerPrice: 150 },
            });
        });
    });

    describe('declineCounterOfferByReference', () => {
        it('throws NotFoundException when no trade-in has that reference', async () => {
            prismaMock.tradeIn.findUnique.mockResolvedValueOnce(null);
            await expect(service.declineCounterOfferByReference('TI-9999')).rejects.toThrow(NotFoundException);
        });

        it('cancels the trade-in, looked up by reference alone', async () => {
            prismaMock.tradeIn.findUnique.mockResolvedValueOnce(makeTradeIn({ status: 'COUNTER_OFFERED', userId: null }));
            await service.declineCounterOfferByReference('TI-1001');
            expect(prismaMock.tradeIn.update).toHaveBeenCalledWith({ where: { id: 'ti-1' }, data: { status: 'CANCELLED' } });
        });
    });

    describe('markUnderReview', () => {
        it('throws BadRequestException when not SUBMITTED', async () => {
            prismaMock.tradeIn.findUnique.mockResolvedValueOnce(makeTradeIn({ status: 'APPROVED' }));
            await expect(service.markUnderReview('ti-1')).rejects.toThrow(BadRequestException);
        });

        it('moves SUBMITTED trade-ins to UNDER_REVIEW', async () => {
            prismaMock.tradeIn.findUnique.mockResolvedValueOnce(makeTradeIn({ status: 'SUBMITTED' }));
            await service.markUnderReview('ti-1');
            expect(prismaMock.tradeIn.update).toHaveBeenCalledWith({ where: { id: 'ti-1' }, data: { status: 'UNDER_REVIEW' } });
        });
    });

    describe('approve', () => {
        it('throws BadRequestException for a non-approvable status', async () => {
            prismaMock.tradeIn.findUnique.mockResolvedValueOnce(makeTradeIn({ status: 'COMPLETED' }));
            await expect(service.approve('ti-1', {})).rejects.toThrow(BadRequestException);
        });

        it('throws BadRequestException when the final price is not positive', async () => {
            prismaMock.tradeIn.findUnique.mockResolvedValueOnce(makeTradeIn({ status: 'SUBMITTED', offerPrice: 0, counterOffer: null }));
            await expect(service.approve('ti-1', {})).rejects.toThrow(BadRequestException);
        });

        it('approves using the counter offer over the original offer price when set', async () => {
            prismaMock.tradeIn.findUnique.mockResolvedValueOnce(makeTradeIn({ status: 'COUNTER_OFFERED', offerPrice: 100, counterOffer: 150, userId: null }));
            prismaMock.tradeIn.update.mockResolvedValueOnce(makeTradeIn({ status: 'APPROVED', offerPrice: 150 }));

            await service.approve('ti-1', { adminNotes: 'ok' });

            expect(prismaMock.tradeIn.update).toHaveBeenCalledWith({
                where: { id: 'ti-1' },
                data: { status: 'APPROVED', offerPrice: 150, adminNotes: 'ok' },
            });
            expect(notificationsMock.create).not.toHaveBeenCalled();
            expect(shippingMock.generatePrepaidLabel).not.toHaveBeenCalled();
        });

        it('notifies the user when userId is present', async () => {
            prismaMock.tradeIn.findUnique.mockResolvedValueOnce(makeTradeIn({ status: 'SUBMITTED', userId: 'user-1', offerPrice: 100 }));
            prismaMock.tradeIn.update.mockResolvedValueOnce(makeTradeIn({ status: 'APPROVED' }));

            await service.approve('ti-1', {});

            expect(notificationsMock.create).toHaveBeenCalledWith(
                'user-1', 'trade_in_approved', expect.any(String), expect.any(String), expect.any(Object),
            );
        });

        it('emails the contact even when there is no account (guest trade-in)', async () => {
            prismaMock.tradeIn.findUnique.mockResolvedValueOnce(makeTradeIn({ status: 'SUBMITTED', userId: null, offerPrice: 100, fulfillment: 'dropoff' }));
            prismaMock.tradeIn.update.mockResolvedValueOnce(makeTradeIn({ status: 'APPROVED', offerPrice: 100 }));

            await service.approve('ti-1', {});

            expect(notificationsMock.create).not.toHaveBeenCalled();
            expect(emailMock.sendTradeInApproved).toHaveBeenCalledWith(expect.objectContaining({
                to: 'jane@example.com', reference: 'TI-1001', price: 100, fulfillment: 'dropoff',
            }));
        });

        it('skips the email when the trade-in has no contact email on file', async () => {
            prismaMock.tradeIn.findUnique.mockResolvedValueOnce(makeTradeIn({ status: 'SUBMITTED', offerPrice: 100, contact: { name: 'Jane' } }));
            prismaMock.tradeIn.update.mockResolvedValueOnce(makeTradeIn({ status: 'APPROVED' }));

            await service.approve('ti-1', {});

            expect(emailMock.sendTradeInApproved).not.toHaveBeenCalled();
        });

        it('generates and emails a prepaid label for ship fulfillment', async () => {
            prismaMock.tradeIn.findUnique.mockResolvedValueOnce(makeTradeIn({ status: 'SUBMITTED', fulfillment: 'ship', userId: null, offerPrice: 100 }));
            prismaMock.tradeIn.update
                .mockResolvedValueOnce(makeTradeIn({ status: 'APPROVED' }))
                .mockResolvedValueOnce(makeTradeIn({ status: 'APPROVED', trackingNumber: 'TRACK1' }));

            await service.approve('ti-1', {});

            expect(shippingMock.generatePrepaidLabel).toHaveBeenCalled();
            expect(prismaMock.tradeIn.update).toHaveBeenCalledWith({
                where: { id: 'ti-1' },
                data: { trackingNumber: 'TRACK1' },
            });
            expect(shippingMock.sendLabelEmail).toHaveBeenCalled();
        });

        it('still returns the approved trade-in if label generation throws', async () => {
            prismaMock.tradeIn.findUnique.mockResolvedValueOnce(makeTradeIn({ status: 'SUBMITTED', fulfillment: 'ship', userId: null, offerPrice: 100 }));
            const approved = makeTradeIn({ status: 'APPROVED' });
            prismaMock.tradeIn.update.mockResolvedValueOnce(approved);
            shippingMock.generatePrepaidLabel.mockRejectedValueOnce(new Error('shippo down'));

            const result = await service.approve('ti-1', {});

            expect(result).toBe(approved);
            expect(shippingMock.sendLabelEmail).not.toHaveBeenCalled();
        });
    });

    describe('reject', () => {
        it('throws BadRequestException for a terminal status', async () => {
            prismaMock.tradeIn.findUnique.mockResolvedValueOnce(makeTradeIn({ status: 'COMPLETED' }));
            await expect(service.reject('ti-1', {})).rejects.toThrow(BadRequestException);
        });

        it('rejects and notifies the user when present', async () => {
            prismaMock.tradeIn.findUnique.mockResolvedValueOnce(makeTradeIn({ status: 'SUBMITTED', userId: 'user-1' }));
            prismaMock.tradeIn.update.mockResolvedValueOnce(makeTradeIn({ status: 'REJECTED' }));

            await service.reject('ti-1', { adminNotes: 'damaged' });

            expect(prismaMock.tradeIn.update).toHaveBeenCalledWith({
                where: { id: 'ti-1' },
                data: { status: 'REJECTED', adminNotes: 'damaged' },
            });
            expect(notificationsMock.create).toHaveBeenCalled();
        });

        it('does not notify in-app when there is no userId, but still emails the contact', async () => {
            prismaMock.tradeIn.findUnique.mockResolvedValueOnce(makeTradeIn({ status: 'SUBMITTED', userId: null }));
            prismaMock.tradeIn.update.mockResolvedValueOnce(makeTradeIn({ status: 'REJECTED' }));
            await service.reject('ti-1', { adminNotes: 'too damaged' });
            expect(notificationsMock.create).not.toHaveBeenCalled();
            expect(emailMock.sendTradeInRejected).toHaveBeenCalledWith(expect.objectContaining({
                to: 'jane@example.com', reference: 'TI-1001', reason: 'too damaged',
            }));
        });
    });

    describe('counterOffer', () => {
        it('throws BadRequestException for a non-counter-offerable status', async () => {
            prismaMock.tradeIn.findUnique.mockResolvedValueOnce(makeTradeIn({ status: 'REJECTED' }));
            await expect(service.counterOffer('ti-1', { counterOffer: 50 })).rejects.toThrow(BadRequestException);
        });

        it('sets COUNTER_OFFERED status and notifies the user', async () => {
            prismaMock.tradeIn.findUnique.mockResolvedValueOnce(makeTradeIn({ status: 'SUBMITTED', userId: 'user-1' }));
            prismaMock.tradeIn.update.mockResolvedValueOnce(makeTradeIn({ status: 'COUNTER_OFFERED', counterOffer: 75 }));

            await service.counterOffer('ti-1', { counterOffer: 75, adminNotes: 'note' });

            expect(prismaMock.tradeIn.update).toHaveBeenCalledWith({
                where: { id: 'ti-1' },
                data: { status: 'COUNTER_OFFERED', counterOffer: 75, adminNotes: 'note' },
            });
            expect(notificationsMock.create).toHaveBeenCalled();
            expect(emailMock.sendTradeInCounterOffer).toHaveBeenCalledWith(expect.objectContaining({
                to: 'jane@example.com', reference: 'TI-1001', originalPrice: 100, counterOffer: 75,
            }));
        });

        it('emails a guest contact too, since accept/decline only works via the emailed reference link', async () => {
            prismaMock.tradeIn.findUnique.mockResolvedValueOnce(makeTradeIn({ status: 'SUBMITTED', userId: null }));
            prismaMock.tradeIn.update.mockResolvedValueOnce(makeTradeIn({ status: 'COUNTER_OFFERED', counterOffer: 60 }));

            await service.counterOffer('ti-1', { counterOffer: 60 });

            expect(notificationsMock.create).not.toHaveBeenCalled();
            expect(emailMock.sendTradeInCounterOffer).toHaveBeenCalledWith(expect.objectContaining({ to: 'jane@example.com', counterOffer: 60 }));
        });
    });

    describe('complete', () => {
        it('throws BadRequestException when not APPROVED', async () => {
            prismaMock.tradeIn.findUnique.mockResolvedValueOnce(makeTradeIn({ status: 'SUBMITTED' }));
            await expect(service.complete('ti-1')).rejects.toThrow(BadRequestException);
        });

        it('marks an APPROVED trade-in as COMPLETED', async () => {
            prismaMock.tradeIn.findUnique.mockResolvedValueOnce(makeTradeIn({ status: 'APPROVED' }));
            await service.complete('ti-1');
            expect(prismaMock.tradeIn.update).toHaveBeenCalledWith({ where: { id: 'ti-1' }, data: { status: 'COMPLETED' } });
        });
    });

    describe('aiPrice', () => {
        const dto = { brand: 'Apple', model: 'iPhone 13', category: 'Phones', condition: 'A', specs: { storage: '128GB' }, answers: {} } as any;

        it('returns the deterministic anchor price unadjusted when no OpenAI key is configured', async () => {
            delete process.env.OPENAI_API_KEY;
            productPricingMock.getTradeInAnchor.mockResolvedValueOnce(120);
            const result = await service.aiPrice(dto);
            expect(result).toEqual({ price: 120, aiUsed: false, source: 'anchor' });
            expect(mockOpenAiCreate).not.toHaveBeenCalled();
        });

        it('skips the AI spec adjustment entirely when there are no specs or answers to weigh', async () => {
            process.env.OPENAI_API_KEY = 'sk-test';
            productPricingMock.getTradeInAnchor.mockResolvedValueOnce(120);
            const result = await service.aiPrice({ ...dto, specs: {}, answers: {} });
            expect(result).toEqual({ price: 120, aiUsed: false, source: 'anchor' });
            expect(mockOpenAiCreate).not.toHaveBeenCalled();
        });

        it('adjusts the anchor price with a bounded AI multiplier when specs/answers are provided', async () => {
            process.env.OPENAI_API_KEY = 'sk-test';
            productPricingMock.getTradeInAnchor.mockResolvedValueOnce(200);
            mockOpenAiCreate.mockResolvedValueOnce({
                choices: [{ message: { content: JSON.stringify({ multiplier: 0.9 }) } }],
            });
            const result = await service.aiPrice(dto);
            // round5(200 * 0.9) = 180
            expect(result).toEqual({ price: 180, aiUsed: false, source: 'anchor' });
            expect(mockOpenAiCreate).toHaveBeenCalledTimes(1);
        });

        it('clamps an out-of-range AI multiplier to the ±20%/+10% bound', async () => {
            process.env.OPENAI_API_KEY = 'sk-test';
            productPricingMock.getTradeInAnchor.mockResolvedValueOnce(200);
            mockOpenAiCreate.mockResolvedValueOnce({
                choices: [{ message: { content: JSON.stringify({ multiplier: 2.5 }) } }],
            });
            const result = await service.aiPrice(dto);
            // multiplier clamped to 1.1 → round5(200 * 1.1) = 220
            expect(result.price).toBe(220);
        });

        it('falls back to the unadjusted anchor when the AI spec-adjustment call fails', async () => {
            process.env.OPENAI_API_KEY = 'sk-test';
            productPricingMock.getTradeInAnchor.mockResolvedValueOnce(120);
            mockOpenAiCreate.mockRejectedValueOnce(new Error('network error'));
            const result = await service.aiPrice(dto);
            expect(result).toEqual({ price: 120, aiUsed: false, source: 'anchor' });
        });

        it('throws InternalServerErrorException when no anchor and no OpenAI key configured', async () => {
            delete process.env.OPENAI_API_KEY;
            await expect(service.aiPrice(dto)).rejects.toThrow(InternalServerErrorException);
        });

        it('applies the margin to the AI-estimated market price', async () => {
            process.env.OPENAI_API_KEY = 'sk-test';
            prismaMock.pricingConfig.findUnique.mockResolvedValueOnce({ value: 30 });
            mockOpenAiCreate.mockResolvedValueOnce({
                choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ price: 200 }) } }],
            });

            const result = await service.aiPrice(dto);

            // applyMargin(200, 30) = max(round(200 * 0.7 / 5) * 5, 10) = 140
            expect(result).toEqual({ price: 140, aiUsed: true, source: 'ai' });
        });

        it('throws InternalServerErrorException when finish_reason is content_filter', async () => {
            process.env.OPENAI_API_KEY = 'sk-test';
            mockOpenAiCreate.mockResolvedValueOnce({
                choices: [{ finish_reason: 'content_filter', message: { content: '{}' } }],
            });
            await expect(service.aiPrice(dto)).rejects.toThrow(InternalServerErrorException);
        });

        it('throws InternalServerErrorException when the AI response has no valid price', async () => {
            process.env.OPENAI_API_KEY = 'sk-test';
            mockOpenAiCreate.mockResolvedValueOnce({
                choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ price: 0 }) } }],
            });
            await expect(service.aiPrice(dto)).rejects.toThrow(InternalServerErrorException);
        });
    });

    describe('suggestSpecs', () => {
        it('returns an empty array when no OpenAI key is configured', async () => {
            delete process.env.OPENAI_API_KEY;
            const result = await service.suggestSpecs('Apple', 'iPhone 13', 'Phones');
            expect(result).toEqual([]);
        });

        it('returns parsed specs on success', async () => {
            process.env.OPENAI_API_KEY = 'sk-test';
            mockOpenAiCreate.mockResolvedValueOnce({
                choices: [{ message: { content: JSON.stringify({ specs: [{ label: 'Storage', options: ['64GB', '128GB'] }] }) } }],
            });
            const result = await service.suggestSpecs('Apple', 'iPhone 13', 'Phones');
            expect(result).toEqual([{ label: 'Storage', options: ['64GB', '128GB'] }]);
        });

        it('returns an empty array when the OpenAI call throws', async () => {
            process.env.OPENAI_API_KEY = 'sk-test';
            mockOpenAiCreate.mockRejectedValueOnce(new Error('network error'));
            const result = await service.suggestSpecs('Apple', 'iPhone 13', 'Phones');
            expect(result).toEqual([]);
        });
    });

    describe('getPublicStats', () => {
        it('combines the base figure with live trade-in and product counts', async () => {
            prismaMock.tradeIn.count.mockResolvedValueOnce(10);
            prismaMock.product.count.mockResolvedValueOnce(5);
            const result = await service.getPublicStats();
            expect(result.devicesRepurposed).toBe(1542830 + 10 + 5);
            expect(result.lifespanExtension).toBe(2.0);
            expect(result.idleElectronics).toBe(5000000000);
        });
    });

    describe('purgeAll', () => {
        it('deletes stored image files and all trade-in rows', async () => {
            prismaMock.tradeIn.findMany.mockResolvedValueOnce([{ images: ['a.jpg', 'b.jpg'] }, { images: ['c.jpg'] }]);
            const result = await service.purgeAll();
            expect(storageMock.deleteFiles).toHaveBeenCalledWith(['a.jpg', 'b.jpg', 'c.jpg']);
            expect(prismaMock.tradeIn.deleteMany).toHaveBeenCalledWith({});
            expect(result).toEqual({ deleted: 3 });
        });

        it('skips file deletion when there are no images', async () => {
            prismaMock.tradeIn.findMany.mockResolvedValueOnce([]);
            const result = await service.purgeAll();
            expect(storageMock.deleteFiles).not.toHaveBeenCalled();
            expect(result).toEqual({ deleted: 0 });
        });
    });
});

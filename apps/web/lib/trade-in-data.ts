export interface TradeInModel {
  name: string;
  category: string;
  brand: string;
  tradeInMode?: 'auto' | 'manual_price' | 'unpriced';
  /** Present only when this suggestion is a real, cataloged device — lets the
   *  picker route straight into that device's real trade-in flow instead of
   *  treating it as an unlisted/manual entry. */
  catalogId?: string;
  attributeOptions?: { label: string; options: string[] }[];
  storageOptions?: string[];
  /** Common abbreviations customers actually type (e.g. "ps5" for "PlayStation 5 ...")
   *  — fuzzy search alone doesn't bridge that gap against the full canonical name. */
  aliases?: string[];
}

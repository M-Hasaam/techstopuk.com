import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { EmailService } from '../../common/services/email.service';
import { PrismaService } from '../database/prisma.service';
import { SettingsService } from '../settings/settings.service';

const SHIPPO_BASE = 'https://api.goshippo.com';
const DEFAULT_SERVICE_LEVEL = 'royalmail_tracked48';

export interface ShipmentRequest {
    reference:      string;
    customerName:   string;
    customerEmail:  string;
    customerPhone?: string;
    type:           'repair' | 'trade-in';
}

export interface ShipmentResult {
    trackingNumber: string;
    labelPdf:       Buffer;
    labelUrl?:      string;
}

@Injectable()
export class ShippingService {
    private readonly logger = new Logger(ShippingService.name);

    constructor(
        private readonly email: EmailService,
        private readonly prisma: PrismaService,
        private readonly settingsService: SettingsService,
    ) {}

    private async getMode(): Promise<string> {
        return (await this.settingsService.get('SHIPPO_MODE')) ?? 'test';
    }

    private async getApiKey(): Promise<string | null> {
        const mode = await this.getMode();
        return this.settingsService.get(`SHIPPO_API_KEY_${mode.toUpperCase()}`);
    }

    private async getServiceLevel(): Promise<string> {
        return (await this.settingsService.get('SHIPPO_SERVICE_LEVEL')) ?? DEFAULT_SERVICE_LEVEL;
    }

    private async getHeaders(): Promise<Record<string, string>> {
        const key = await this.getApiKey();
        return {
            'Authorization': `ShippoToken ${key ?? ''}`,
            'Content-Type':  'application/json',
        };
    }

    /** Configuration snapshot for the health check — never exposes the key itself. */
    async getHealthStatus(): Promise<{ configured: boolean; mode: string; keyMode: 'test' | 'live' | 'unknown' }> {
        const mode = await this.getMode();
        const key = await this.getApiKey();
        const keyMode = key?.startsWith('shippo_live_') ? 'live' : key?.startsWith('shippo_test_') ? 'test' : 'unknown';
        return { configured: Boolean(key), mode, keyMode };
    }

    private async getStoreAddress() {
        const store = await this.prisma.store.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' } });
        return {
            name:    store?.name     || 'TechStop Leicester',
            street1: store?.address  || '1 High Street',
            city:    store?.city     || 'Leicester',
            zip:     store?.postcode || 'LE1 1AA',
            country: 'GB',
            email:   store?.phone    || '',
        };
    }

    async generatePrepaidLabel(req: ShipmentRequest): Promise<ShipmentResult> {
        const apiKey = await this.getApiKey();
        if (!apiKey) {
            this.logger.warn('Shippo API key not configured — using mock label');
            return this.mockLabel(req.reference);
        }

        const storeAddress = await this.getStoreAddress();
        const headers = await this.getHeaders();

        // Step 1: Create shipment and get rates (async: false = wait for rates inline)
        const shipmentRes = await fetch(`${SHIPPO_BASE}/shipments/`, {
            method:  'POST',
            headers,
            body: JSON.stringify({
                address_from: {
                    name:    req.customerName,
                    street1: 'As provided at booking',
                    city:    'Leicester',
                    zip:     'LE1 1AA',
                    country: 'GB',
                    email:   req.customerEmail,
                    phone:   req.customerPhone ?? '',
                },
                address_to: storeAddress,
                parcels: [{
                    length:        '20',
                    width:         '15',
                    height:        '5',
                    distance_unit: 'cm',
                    weight:        '0.5',
                    mass_unit:     'kg',
                }],
                async: false,
            }),
        });

        if (!shipmentRes.ok) {
            const err = await shipmentRes.text();
            this.logger.error(`Shippo shipment creation failed: ${err}`);
            throw new BadRequestException(`Shippo API error: ${shipmentRes.status} - ${err}`);
        }

        const shipment = await shipmentRes.json() as {
            object_id: string;
            rates: Array<{ object_id: string; servicelevel: { token: string } }>;
        };

        if (!shipment.rates || shipment.rates.length === 0) {
            this.logger.error('No shipping rates returned by Shippo');
            throw new BadRequestException('No shipping rates available from Shippo — check the carrier account is active for this mode');
        }

        // Step 2: Prefer the configured service level, but keep the rest as fallbacks —
        // a single carrier (test or live) can reject a shipment while others succeed fine,
        // so picking only the first rate and giving up on it risks failing labels that would
        // otherwise go through on the next available carrier.
        const serviceLevel = await this.getServiceLevel();
        const preferredRate = shipment.rates.find(r => r.servicelevel.token === serviceLevel);
        const candidateRates = preferredRate
            ? [preferredRate, ...shipment.rates.filter(r => r !== preferredRate)]
            : shipment.rates;

        let lastFailure = 'Shippo label generation failed';
        for (const rate of candidateRates) {
            // Step 3: Purchase the label
            const txRes = await fetch(`${SHIPPO_BASE}/transactions/`, {
                method:  'POST',
                headers,
                body: JSON.stringify({
                    rate:            rate.object_id,
                    label_file_type: 'PDF',
                    async:           false,
                }),
            });

            if (!txRes.ok) {
                const err = await txRes.text();
                this.logger.warn(`Shippo transaction failed for rate ${rate.servicelevel.token} (HTTP ${txRes.status}): ${err}`);
                lastFailure = `Shippo transaction error: ${txRes.status} - ${err}`;
                continue;
            }

            const tx = await txRes.json() as {
                status:          string;
                tracking_number: string;
                label_url:       string;
            };

            if (tx.status !== 'SUCCESS') {
                this.logger.warn(`Shippo transaction not successful for rate ${rate.servicelevel.token}: ${JSON.stringify(tx)}`);
                lastFailure = 'Shippo label generation failed';
                continue;
            }

            // Step 4: Download the PDF
            const labelPdf = await this.fetchLabelPdf(tx.label_url);
            return { trackingNumber: tx.tracking_number, labelPdf, labelUrl: tx.label_url };
        }

        this.logger.error(`All Shippo rate attempts failed for shipment ${shipment.object_id}: ${lastFailure}`);
        throw new BadRequestException(lastFailure);
    }

    /** Re-downloads a previously purchased label's PDF — used to resend a label email without buying a new one. */
    async fetchLabelPdf(labelUrl: string): Promise<Buffer> {
        const pdfRes = await fetch(labelUrl);
        if (!pdfRes.ok) throw new BadRequestException('Failed to download label PDF from Shippo');
        return Buffer.from(await pdfRes.arrayBuffer());
    }

    async sendLabelEmail(req: ShipmentRequest, result: ShipmentResult) {
        await this.email.sendShippingLabel({
            to:             req.customerEmail,
            customerName:   req.customerName,
            reference:      req.reference,
            trackingNumber: result.trackingNumber,
            type:           req.type,
            labelPdf:       result.labelPdf,
        });
    }

    async trackShipment(trackingNumber: string): Promise<{ status: string; events: any[] }> {
        const apiKey = await this.getApiKey();
        if (!apiKey) return { status: 'unknown', events: [] };

        const res = await fetch(`${SHIPPO_BASE}/tracks/shippo/${trackingNumber}`, {
            headers: await this.getHeaders(),
        });

        if (!res.ok) return { status: 'unknown', events: [] };

        const data = await res.json() as any;
        return {
            status: data?.tracking_status?.status ?? 'unknown',
            events: data?.tracking_history ?? [],
        };
    }

    private mockLabel(reference: string): ShipmentResult {
        const trackingNumber = `MOCK${reference.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)}GB`;
        const labelPdf = Buffer.from('%PDF-1.4 mock label for ' + reference);
        this.logger.warn(`Mock label generated for ${reference} — configure a Shippo key in Admin Settings for real labels`);
        return { trackingNumber, labelPdf };
    }

    // ─── Admin-managed settings ────────────────────────────────────────────────────

    async getSettings() {
        const [mode, keyTest, keyLive, serviceLevel] = await Promise.all([
            this.getMode(),
            this.settingsService.get('SHIPPO_API_KEY_TEST'),
            this.settingsService.get('SHIPPO_API_KEY_LIVE'),
            this.getServiceLevel(),
        ]);
        return {
            mode,
            shippoApiKeyTest:   this.settingsService.mask(keyTest),
            shippoApiKeyLive:   this.settingsService.mask(keyLive),
            shippoServiceLevel: serviceLevel,
        };
    }

    async updateSettings(dto: { mode?: string; shippoApiKeyTest?: string; shippoApiKeyLive?: string; shippoServiceLevel?: string }) {
        const map: Record<string, string | undefined> = {
            SHIPPO_MODE:          dto.mode,
            SHIPPO_API_KEY_TEST:  dto.shippoApiKeyTest,
            SHIPPO_API_KEY_LIVE:  dto.shippoApiKeyLive,
            SHIPPO_SERVICE_LEVEL: dto.shippoServiceLevel,
        };
        await Promise.all(
            Object.entries(map)
                .filter(([, v]) => v !== undefined && v !== '')
                .map(([key, value]) => this.settingsService.set(key, value!)),
        );
        return this.getSettings();
    }

    async testConnection() {
        const key = await this.getApiKey();
        if (!key) throw new BadRequestException('Shippo API key is not configured');
        const res = await fetch(`${SHIPPO_BASE}/carrier_accounts/`, { headers: await this.getHeaders() });
        if (!res.ok) throw new BadRequestException(`Shippo connection failed (status ${res.status})`);
        return { ok: true };
    }
}

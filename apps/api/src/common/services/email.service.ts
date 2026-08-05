import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
    private readonly logger = new Logger(EmailService.name);
    private transporter: nodemailer.Transporter;

    constructor() {
        this.transporter = nodemailer.createTransport({
            host:   process.env.SMTP_HOST   || 'smtp.gmail.com',
            port:   Number(process.env.SMTP_PORT) || 587,
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
        });
    }

    isConfigured(): boolean {
        return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
    }

    /** Connects + authenticates against the SMTP server without sending anything — used by the health check. */
    async verifyConnection(): Promise<{ ok: boolean; error?: string }> {
        if (!this.isConfigured()) return { ok: false, error: 'SMTP_USER/SMTP_PASS not configured' };
        try {
            await this.transporter.verify();
            return { ok: true };
        } catch (error) {
            return { ok: false, error: error instanceof Error ? error.message : 'Unknown SMTP error' };
        }
    }

    async sendOrderConfirmation(opts: {
        to: string;
        customerName: string;
        orderId: string;
        items: { name: string; quantity: number; price: number }[];
        subtotal: number;
        shipping: number;
        total: number;
        shippingAddress: { name: string; address: string; city: string; postcode: string; country: string };
    }) {
        const ref = opts.orderId.slice(0, 8).toUpperCase();
        const siteUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
        const itemRows = opts.items
            .map(i => `
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:14px;color:#111">${i.name}</td>
                <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:14px;color:#111;text-align:center">×${i.quantity}</td>
                <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:14px;color:#111;text-align:right">£${(i.price * i.quantity).toFixed(2)}</td>
              </tr>`)
            .join('');

        const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
</head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:40px 0">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:24px;overflow:hidden;max-width:560px;width:100%">

        <!-- Header -->
        <tr><td bgcolor="#000000" style="background:#000;padding:32px 40px;text-align:center">
          <p style="margin:0;color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.5px">TECHSTOP<span style="color:#c3eb4e">LEICESTER</span></p>
        </td></tr>

        <!-- Check icon + title -->
        <tr><td style="padding:40px 40px 24px;text-align:center">
          <table cellpadding="0" cellspacing="0" width="72" height="72" align="center" bgcolor="#c3eb4e" style="width:72px;height:72px;background:#c3eb4e;border-radius:20px;margin-bottom:20px">
            <tr><td align="center" valign="middle" bgcolor="#c3eb4e" style="background:#c3eb4e;border-radius:20px"><span style="font-size:36px;color:#111">✓</span></td></tr>
          </table>
          <h1 style="margin:0 0 8px;font-size:28px;font-weight:700;color:#111">Order confirmed!</h1>
          <p style="margin:0;color:#666;font-size:15px">Hi ${opts.customerName}, your order is on its way.</p>
        </td></tr>

        <!-- Order ref -->
        <tr><td style="padding:0 40px 24px">
          <div style="background:#f5f5f7;border-radius:14px;padding:16px 20px;text-align:center">
            <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.1em;color:#999;text-transform:uppercase">Order reference</p>
            <p style="margin:0;font-size:22px;font-weight:700;color:#111">#${ref}</p>
          </div>
        </td></tr>

        <!-- Items -->
        <tr><td style="padding:0 40px 24px">
          <p style="margin:0 0 12px;font-size:11px;font-weight:700;letter-spacing:0.1em;color:#999;text-transform:uppercase">Items ordered</p>
          <table width="100%" cellpadding="0" cellspacing="0">
            ${itemRows}
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px">
            <tr>
              <td style="font-size:13px;color:#666;padding:4px 0">Subtotal</td>
              <td style="font-size:13px;color:#666;padding:4px 0;text-align:right">£${opts.subtotal.toFixed(2)}</td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#666;padding:4px 0">Delivery</td>
              <td style="font-size:13px;color:#16a34a;font-weight:700;padding:4px 0;text-align:right">${opts.shipping === 0 ? 'Free' : '£' + opts.shipping.toFixed(2)}</td>
            </tr>
            <tr>
              <td style="font-size:16px;font-weight:700;color:#111;padding:10px 0 4px;border-top:2px solid #111">Total</td>
              <td style="font-size:16px;font-weight:700;color:#111;padding:10px 0 4px;text-align:right;border-top:2px solid #111">£${opts.total.toFixed(2)}</td>
            </tr>
          </table>
        </td></tr>

        <!-- Shipping address -->
        <tr><td style="padding:0 40px 24px">
          <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:0.1em;color:#999;text-transform:uppercase">Delivering to</p>
          <p style="margin:0;font-size:14px;color:#111;line-height:1.6">
            ${opts.shippingAddress.name}<br>
            ${opts.shippingAddress.address}<br>
            ${opts.shippingAddress.city}, ${opts.shippingAddress.postcode}<br>
            ${opts.shippingAddress.country}
          </p>
        </td></tr>

        <!-- Next steps -->
        <tr><td style="padding:0 40px 32px">
          <div style="background:#f5f5f7;border-radius:14px;padding:20px">
            <p style="margin:0 0 14px;font-size:11px;font-weight:700;letter-spacing:0.1em;color:#999;text-transform:uppercase">What happens next</p>
            <table width="100%" cellpadding="0" cellspacing="0">
            ${[
              ['1', 'Dispatched within 24 hours via Royal Mail Tracked 24'],
              ['2', 'Tracking number emailed once dispatched'],
              ['3', 'Delivered in 1–2 working days'],
            ].map(([n, t]) => `
              <tr>
                <td width="28" valign="top" style="padding-bottom:10px">
                  <table cellpadding="0" cellspacing="0" width="28" height="28" bgcolor="#111111" style="width:28px;height:28px;background:#111;border-radius:50%">
                    <tr><td align="center" valign="middle" bgcolor="#111111" style="background:#111;color:#fff;font-weight:700;font-size:12px">${n}</td></tr>
                  </table>
                </td>
                <td valign="middle" style="padding:0 0 10px 12px;font-size:13px;color:#444;font-weight:500">${t}</td>
              </tr>`).join('')}
            </table>
          </div>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f5f5f7;padding:20px 40px;text-align:center;border-top:1px solid #eee">
          <p style="margin:0;font-size:12px;color:#999">Questions? Reply to this email or visit <a href="${siteUrl}" style="color:#111;font-weight:700">${siteUrl.replace(/^https?:\/\//, '')}</a></p>
          <p style="margin:8px 0 0;font-size:11px;color:#bbb">© TechStop Leicester</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

        try {
            await this.transporter.sendMail({
                from:    `"TechStop Leicester" <${process.env.SMTP_USER}>`,
                to:      opts.to,
                subject: `Order confirmed #${ref} — TechStop Leicester`,
                html,
                text: `Hi ${opts.customerName},\n\nYour order #${ref} is confirmed and will be dispatched within 24 hours.\n\nTotal: £${opts.total.toFixed(2)}\n\nDelivering to:\n${opts.shippingAddress.name}\n${opts.shippingAddress.address}\n${opts.shippingAddress.city} ${opts.shippingAddress.postcode}\n\nThanks,\nTechStop Leicester`,
            });
            this.logger.log(`Order confirmation email sent to ${opts.to} for order ${opts.orderId}`);
        } catch (err) {
            this.logger.error(`Failed to send order confirmation email to ${opts.to}`, err);
        }
    }

    async sendShippingLabel(opts: {
        to:             string;
        customerName:   string;
        reference:      string;
        trackingNumber: string;
        type:           'repair' | 'trade-in';
        labelPdf:       Buffer;
    }) {
        const subject = opts.type === 'repair'
            ? `Your prepaid return label — Repair ${opts.reference}`
            : `Your prepaid shipping label — Trade-In ${opts.reference}`;

        const body = opts.type === 'repair'
            ? `Hi ${opts.customerName},\n\nYour repair quote has been approved. Please use the attached prepaid Royal Mail label to send your device to us.\n\nTracking number: ${opts.trackingNumber}\n\nSimply print the label, attach it to your securely packaged device, and drop it at any Post Office or Royal Mail collection point.\n\nWe'll notify you as soon as we receive it and begin the repair.\n\nThanks,\nTechStop Leicester`
            : `Hi ${opts.customerName},\n\nYour trade-in has been approved. Please use the attached prepaid Royal Mail label to send your device to us.\n\nTracking number: ${opts.trackingNumber}\n\nSimply print the label, attach it to your securely packaged device, and drop it at any Post Office or Royal Mail collection point.\n\nWe'll process your trade-in as soon as we receive it.\n\nThanks,\nTechStop Leicester`;

        try {
            await this.transporter.sendMail({
                from:    `"TechStop Leicester" <${process.env.SMTP_USER}>`,
                to:      opts.to,
                subject,
                text:    body,
                attachments: [{
                    filename:    `label-${opts.reference}.pdf`,
                    content:     opts.labelPdf,
                    contentType: 'application/pdf',
                }],
            });
            this.logger.log(`Shipping label email sent to ${opts.to} for ${opts.reference}`);
        } catch (err) {
            this.logger.error(`Failed to send shipping label email to ${opts.to}`, err);
            throw err;
        }
    }

    /** Shared header/footer chrome for the shorter transactional emails below. */
    private wrapEmailShell(opts: { badgeColor: string; badgeIcon: string; title: string; intro: string; bodyHtml: string; siteUrl: string }): string {
        return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
</head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:40px 0">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:24px;overflow:hidden;max-width:560px;width:100%">

        <tr><td bgcolor="#000000" style="background:#000;padding:32px 40px;text-align:center">
          <p style="margin:0;color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.5px">TECHSTOP<span style="color:#c3eb4e">LEICESTER</span></p>
        </td></tr>

        <tr><td style="padding:40px 40px 24px;text-align:center">
          <table cellpadding="0" cellspacing="0" width="72" height="72" align="center" bgcolor="${opts.badgeColor}" style="width:72px;height:72px;background:${opts.badgeColor};border-radius:20px;margin-bottom:20px">
            <tr><td align="center" valign="middle" bgcolor="${opts.badgeColor}" style="background:${opts.badgeColor};border-radius:20px"><span style="font-size:32px;color:#111">${opts.badgeIcon}</span></td></tr>
          </table>
          <h1 style="margin:0 0 8px;font-size:28px;font-weight:700;color:#111">${opts.title}</h1>
          <p style="margin:0;color:#666;font-size:15px">${opts.intro}</p>
        </td></tr>

        ${opts.bodyHtml}

        <tr><td style="background:#f5f5f7;padding:20px 40px;text-align:center;border-top:1px solid #eee">
          <p style="margin:0;font-size:12px;color:#999">Questions? Reply to this email or visit <a href="${opts.siteUrl}" style="color:#111;font-weight:700">${opts.siteUrl.replace(/^https?:\/\//, '')}</a></p>
          <p style="margin:8px 0 0;font-size:11px;color:#bbb">© TechStop Leicester</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
    }

    async sendTradeInApproved(opts: {
        to: string;
        customerName: string;
        reference: string;
        brand: string;
        model: string;
        price: number;
        fulfillment: string;
        store?: { name: string; address: string; city: string; postcode: string; openingHours?: string | null } | null;
    }) {
        const siteUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
        const nextSteps = opts.fulfillment === 'ship'
            ? `You'll receive a separate email shortly with your free, fully-insured prepaid Royal Mail shipping label — just print it, pack your device securely, and drop it at any Post Office.`
            : opts.store
                ? `Bring your device to ${opts.store.name}, ${opts.store.address}, ${opts.store.city} ${opts.store.postcode}${opts.store.openingHours ? ` (${opts.store.openingHours})` : ''} — no appointment needed.`
                : `Bring your device to your selected store to complete the trade-in.`;

        const bodyHtml = `
        <tr><td style="padding:0 40px 24px">
          <div style="background:#f5f5f7;border-radius:14px;padding:16px 20px;text-align:center">
            <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.1em;color:#999;text-transform:uppercase">Trade-in reference</p>
            <p style="margin:0;font-size:22px;font-weight:700;color:#111">${opts.reference}</p>
          </div>
        </td></tr>
        <tr><td style="padding:0 40px 24px">
          <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:0.1em;color:#999;text-transform:uppercase">Device</p>
          <p style="margin:0 0 16px;font-size:15px;color:#111;font-weight:600">${opts.brand} ${opts.model}</p>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="font-size:16px;font-weight:700;color:#111;padding:10px 0 4px;border-top:2px solid #111">Offer accepted</td>
              <td style="font-size:20px;font-weight:700;color:#16a34a;padding:10px 0 4px;text-align:right;border-top:2px solid #111">£${opts.price.toFixed(2)}</td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding:0 40px 32px">
          <div style="background:#f5f5f7;border-radius:14px;padding:20px">
            <p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:0.1em;color:#999;text-transform:uppercase">What happens next</p>
            <p style="margin:0;font-size:13px;color:#444;line-height:1.6">${nextSteps}</p>
          </div>
        </td></tr>`;

        const html = this.wrapEmailShell({
            badgeColor: '#c3eb4e',
            badgeIcon: '&#10003;',
            title: 'Trade-in approved!',
            intro: `Hi ${opts.customerName}, great news about your ${opts.brand} ${opts.model}.`,
            bodyHtml,
            siteUrl,
        });

        try {
            await this.transporter.sendMail({
                from:    `"TechStop Leicester" <${process.env.SMTP_USER}>`,
                to:      opts.to,
                subject: `Trade-in approved — £${opts.price.toFixed(2)} for your ${opts.brand} ${opts.model}`,
                html,
                text: `Hi ${opts.customerName},\n\nYour ${opts.brand} ${opts.model} trade-in (ref ${opts.reference}) has been approved for £${opts.price.toFixed(2)}.\n\n${nextSteps}\n\nThanks,\nTechStop Leicester`,
            });
            this.logger.log(`Trade-in approved email sent to ${opts.to} for ${opts.reference}`);
        } catch (err) {
            this.logger.error(`Failed to send trade-in approved email to ${opts.to}`, err);
        }
    }

    async sendTradeInRejected(opts: {
        to: string;
        customerName: string;
        reference: string;
        brand: string;
        model: string;
        reason?: string;
    }) {
        const siteUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
        const bodyHtml = `
        <tr><td style="padding:0 40px 24px">
          <div style="background:#f5f5f7;border-radius:14px;padding:16px 20px;text-align:center">
            <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.1em;color:#999;text-transform:uppercase">Trade-in reference</p>
            <p style="margin:0;font-size:22px;font-weight:700;color:#111">${opts.reference}</p>
          </div>
        </td></tr>
        <tr><td style="padding:0 40px 32px">
          <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:0.1em;color:#999;text-transform:uppercase">Device</p>
          <p style="margin:0 0 16px;font-size:15px;color:#111;font-weight:600">${opts.brand} ${opts.model}</p>
          ${opts.reason ? `<div style="background:#f5f5f7;border-radius:14px;padding:20px"><p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:0.1em;color:#999;text-transform:uppercase">Reason</p><p style="margin:0;font-size:13px;color:#444;line-height:1.6">${opts.reason}</p></div>` : ''}
        </td></tr>`;

        const html = this.wrapEmailShell({
            badgeColor: '#f5f5f7',
            badgeIcon: '&#10005;',
            title: 'Trade-in not accepted',
            intro: `Hi ${opts.customerName}, unfortunately we can't accept this device.`,
            bodyHtml,
            siteUrl,
        });

        try {
            await this.transporter.sendMail({
                from:    `"TechStop Leicester" <${process.env.SMTP_USER}>`,
                to:      opts.to,
                subject: `Trade-in update — ${opts.brand} ${opts.model}`,
                html,
                text: `Hi ${opts.customerName},\n\nUnfortunately we're unable to accept your ${opts.brand} ${opts.model} trade-in (ref ${opts.reference}) at this time.${opts.reason ? `\n\nReason: ${opts.reason}` : ''}\n\nThanks,\nTechStop Leicester`,
            });
            this.logger.log(`Trade-in rejected email sent to ${opts.to} for ${opts.reference}`);
        } catch (err) {
            this.logger.error(`Failed to send trade-in rejected email to ${opts.to}`, err);
        }
    }

    async sendTradeInCounterOffer(opts: {
        to: string;
        customerName: string;
        reference: string;
        brand: string;
        model: string;
        originalPrice: number;
        counterOffer: number;
    }) {
        const siteUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
        const statusUrl = `${siteUrl}/trade-in/status/${opts.reference}`;
        const bodyHtml = `
        <tr><td style="padding:0 40px 24px">
          <div style="background:#f5f5f7;border-radius:14px;padding:16px 20px;text-align:center">
            <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.1em;color:#999;text-transform:uppercase">Trade-in reference</p>
            <p style="margin:0;font-size:22px;font-weight:700;color:#111">${opts.reference}</p>
          </div>
        </td></tr>
        <tr><td style="padding:0 40px 24px">
          <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:0.1em;color:#999;text-transform:uppercase">Device</p>
          <p style="margin:0 0 16px;font-size:15px;color:#111;font-weight:600">${opts.brand} ${opts.model}</p>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="font-size:13px;color:#666;padding:4px 0">Your original estimate</td>
              <td style="font-size:13px;color:#666;padding:4px 0;text-align:right;text-decoration:line-through">£${opts.originalPrice.toFixed(2)}</td>
            </tr>
            <tr>
              <td style="font-size:16px;font-weight:700;color:#111;padding:10px 0 4px;border-top:2px solid #111">Our new offer</td>
              <td style="font-size:20px;font-weight:700;color:#111;padding:10px 0 4px;text-align:right;border-top:2px solid #111">£${opts.counterOffer.toFixed(2)}</td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding:0 40px 32px;text-align:center">
          <a href="${statusUrl}" style="display:inline-block;background:#111;color:#fff;font-size:14px;font-weight:700;padding:14px 32px;border-radius:14px;text-decoration:none">Review &amp; respond to offer</a>
          <p style="margin:16px 0 0;font-size:12px;color:#999">You can accept or decline — no account needed.</p>
        </td></tr>`;

        const html = this.wrapEmailShell({
            badgeColor: '#c3eb4e',
            badgeIcon: '&pound;',
            title: 'New offer on your trade-in',
            intro: `Hi ${opts.customerName}, we've reviewed your ${opts.brand} ${opts.model}.`,
            bodyHtml,
            siteUrl,
        });

        try {
            await this.transporter.sendMail({
                from:    `"TechStop Leicester" <${process.env.SMTP_USER}>`,
                to:      opts.to,
                subject: `New offer: £${opts.counterOffer.toFixed(2)} for your ${opts.brand} ${opts.model}`,
                html,
                text: `Hi ${opts.customerName},\n\nWe've reviewed your ${opts.brand} ${opts.model} trade-in (ref ${opts.reference}) and are offering £${opts.counterOffer.toFixed(2)} (your original estimate was £${opts.originalPrice.toFixed(2)}).\n\nReview and respond here: ${statusUrl}\n\nThanks,\nTechStop Leicester`,
            });
            this.logger.log(`Trade-in counter-offer email sent to ${opts.to} for ${opts.reference}`);
        } catch (err) {
            this.logger.error(`Failed to send trade-in counter-offer email to ${opts.to}`, err);
        }
    }

    async sendAdminPaymentAlert(opts: {
        paymentIntentId: string;
        amountPounds: string;
        customerEmail: string;
    }) {
        const adminEmail = process.env.SMTP_USER;
        if (!adminEmail) return;
        try {
            await this.transporter.sendMail({
                from: `"TechStop Leicester" <${adminEmail}>`,
                to: adminEmail,
                subject: `[URGENT] Payment received but no order found — £${opts.amountPounds}`,
                text: [
                    'A Stripe payment succeeded but no matching order was found in the database.',
                    '',
                    `Payment Intent ID: ${opts.paymentIntentId}`,
                    `Amount: £${opts.amountPounds}`,
                    `Customer email: ${opts.customerEmail}`,
                    '',
                    'Action required: check the Stripe dashboard and manually create or investigate this order.',
                ].join('\n'),
            });
        } catch (err) {
            this.logger.error('Failed to send admin payment alert', err);
        }
    }
}

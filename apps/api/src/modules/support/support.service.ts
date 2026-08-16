import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
  ) {}

  // ─── Support Contact Email ─────────────────────────────────────────────────

  /** No hardcoded fallback on purpose — callers (public Help page, admin
   *  settings form) should treat null as "not configured" and render nothing
   *  rather than surface a placeholder address nobody actually checks. */
  async getContactEmail(): Promise<string | null> {
    return this.settingsService.get('SUPPORT_EMAIL');
  }

  async updateContactEmail(email: string): Promise<{ email: string }> {
    await this.settingsService.set('SUPPORT_EMAIL', email);
    return { email };
  }

  // ─── Helpline Numbers ──────────────────────────────────────────────────────

  async getHelplines() {
    return this.prisma.helplineNumber.findMany({
      where: { isActive: true },
      orderBy: { order: 'asc' },
    });
  }

  async getAllHelplines() {
    return this.prisma.helplineNumber.findMany({ orderBy: { order: 'asc' } });
  }

  async createHelpline(dto: { label: string; number: string; order?: number }) {
    return this.prisma.helplineNumber.create({ data: dto });
  }

  async updateHelpline(id: string, dto: { label?: string; number?: string; isActive?: boolean; order?: number }) {
    return this.prisma.helplineNumber.update({ where: { id }, data: dto });
  }

  async deleteHelpline(id: string) {
    return this.prisma.helplineNumber.delete({ where: { id } });
  }

  // ─── Chats ─────────────────────────────────────────────────────────────────

  async createChat(guestName: string, guestEmail?: string, orderRef?: string) {
    const trimmedName = guestName.trim();
    const trimmedEmail = guestEmail?.trim() || null;

    // 1. Re-use existing active open chat for the same customer if available
    const existingOpen = await this.prisma.supportChat.findFirst({
      where: {
        status: 'open',
        OR: [
          ...(trimmedEmail ? [{ guestEmail: trimmedEmail }] : []),
          { guestName: trimmedName },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });

    if (existingOpen) {
      return existingOpen;
    }

    // 2. Auto-close any orphaned empty chats (0 messages) for this user to keep admin list clean
    await this.prisma.supportChat.updateMany({
      where: {
        status: 'open',
        OR: [
          ...(trimmedEmail ? [{ guestEmail: trimmedEmail }] : []),
          { guestName: trimmedName },
        ],
        messages: { none: {} },
      },
      data: { status: 'closed' },
    });

    // 3. Create fresh chat session
    return this.prisma.supportChat.create({
      data: { guestName: trimmedName, guestEmail: trimmedEmail, orderRef },
      include: { messages: true },
    });
  }

  async getChat(id: string) {
    const chat = await this.prisma.supportChat.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!chat) throw new NotFoundException('Chat not found');
    return chat;
  }

  async getAllChats() {
    // Auto-close empty orphaned open chats older than 5 minutes
    const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);
    await this.prisma.supportChat.updateMany({
      where: {
        status: 'open',
        createdAt: { lt: fiveMinsAgo },
        messages: { none: {} },
      },
      data: { status: 'closed' },
    });

    return this.prisma.supportChat.findMany({
      orderBy: { updatedAt: 'desc' },
      include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
  }

  async closeChat(id: string) {
    return this.prisma.supportChat.update({
      where: { id },
      data: { status: 'closed' },
    });
  }

  async addMessage(chatId: string, sender: 'customer' | 'admin', body: string) {
    const [message] = await this.prisma.$transaction([
      this.prisma.chatMessage.create({ data: { chatId, sender, body } }),
      this.prisma.supportChat.update({
        where: { id: chatId },
        data: { updatedAt: new Date() },
      }),
    ]);
    return message;
  }
}

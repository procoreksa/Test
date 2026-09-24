import type { Prisma, PrismaClient, CommunicationEventType } from "@prisma/client";
import { nextCounterValue } from "@/lib/numbering";
import { getEventDefinition } from "./events";

type Tx = Prisma.TransactionClient | PrismaClient;

interface DefaultTemplateContent {
  eventType: CommunicationEventType;
  language: "en" | "ar";
  subject: string;
  bodyText: string;
}

/**
 * Default EMAIL-channel templates for the 9 mandated wired events, in both
 * languages. WhatsApp templates are deliberately NOT seeded here - a real
 * WhatsApp Business template requires Meta approval before it can ever be
 * used, which is outside this phase's scope (see
 * docs/NOTIFICATIONS-COMMUNICATIONS.md, "WhatsApp template approval"); the
 * schema/rule/UI support for a WHATSAPP CommunicationTemplate is real and
 * complete, it simply has no pre-approved default content to seed.
 */
const DEFAULT_TEMPLATES: DefaultTemplateContent[] = [
  {
    eventType: "INVOICE_ISSUED",
    language: "en",
    subject: "Invoice {{invoiceNumber}} issued",
    bodyText:
      "Dear {{renterName}},\n\nA new invoice {{invoiceNumber}} for {{totalAmount}} {{currency}} has been issued for contract {{contractNumber}} (Unit {{unitNumber}}), due on {{dueDate}}.\n\nThank you.",
  },
  {
    eventType: "INVOICE_ISSUED",
    language: "ar",
    subject: "تم إصدار الفاتورة {{invoiceNumber}}",
    bodyText:
      "عزيزي {{renterName}}،\n\nتم إصدار فاتورة جديدة برقم {{invoiceNumber}} بمبلغ {{totalAmount}} {{currency}} للعقد {{contractNumber}} (وحدة {{unitNumber}})، تستحق بتاريخ {{dueDate}}.\n\nشكراً لكم.",
  },
  {
    eventType: "PAYMENT_RECEIVED",
    language: "en",
    subject: "Payment received - receipt {{receiptNumber}}",
    bodyText:
      "Dear {{renterName}},\n\nWe have received your payment of {{amount}} {{currency}} on {{paymentDate}} against invoice {{invoiceNumber}}. Receipt number: {{receiptNumber}}.\n\nThank you.",
  },
  {
    eventType: "PAYMENT_RECEIVED",
    language: "ar",
    subject: "تم استلام الدفعة - إيصال {{receiptNumber}}",
    bodyText:
      "عزيزي {{renterName}}،\n\nتم استلام دفعتكم بمبلغ {{amount}} {{currency}} بتاريخ {{paymentDate}} مقابل الفاتورة {{invoiceNumber}}. رقم الإيصال: {{receiptNumber}}.\n\nشكراً لكم.",
  },
  {
    eventType: "MAINTENANCE_REQUEST_CREATED",
    language: "en",
    subject: "Maintenance request {{requestNumber}} received",
    bodyText:
      "Your maintenance request {{requestNumber}} ({{title}}) for Unit {{unitNumber}} has been received. Category: {{category}}, Priority: {{priority}}. We will follow up shortly.",
  },
  {
    eventType: "MAINTENANCE_REQUEST_CREATED",
    language: "ar",
    subject: "تم استلام طلب الصيانة {{requestNumber}}",
    bodyText: "تم استلام طلب الصيانة {{requestNumber}} ({{title}}) للوحدة {{unitNumber}}. الفئة: {{category}}، الأولوية: {{priority}}. سنتواصل معكم قريباً.",
  },
  {
    eventType: "MAINTENANCE_SCHEDULED",
    language: "en",
    subject: "Maintenance visit scheduled - {{requestNumber}}",
    bodyText: "A maintenance visit for request {{requestNumber}} (work order {{workOrderNumber}}) at Unit {{unitNumber}} has been scheduled for {{scheduledDate}}.",
  },
  {
    eventType: "MAINTENANCE_SCHEDULED",
    language: "ar",
    subject: "تحديد موعد زيارة الصيانة - {{requestNumber}}",
    bodyText: "تم تحديد موعد زيارة الصيانة لطلب {{requestNumber}} (أمر العمل {{workOrderNumber}}) في الوحدة {{unitNumber}} بتاريخ {{scheduledDate}}.",
  },
  {
    eventType: "MAINTENANCE_COMPLETED",
    language: "en",
    subject: "Maintenance completed - {{requestNumber}}",
    bodyText: "The maintenance work for request {{requestNumber}} (work order {{workOrderNumber}}) at Unit {{unitNumber}} was completed on {{completedDate}}.",
  },
  {
    eventType: "MAINTENANCE_COMPLETED",
    language: "ar",
    subject: "اكتملت أعمال الصيانة - {{requestNumber}}",
    bodyText: "تم الانتهاء من أعمال الصيانة لطلب {{requestNumber}} (أمر العمل {{workOrderNumber}}) في الوحدة {{unitNumber}} بتاريخ {{completedDate}}.",
  },
  {
    eventType: "MOVE_IN_SCHEDULED",
    language: "en",
    subject: "Move-In scheduled - {{moveInNumber}}",
    bodyText: "Your Move-In {{moveInNumber}} for contract {{contractNumber}} (Unit {{unitNumber}}) has been scheduled for {{scheduledAt}}.",
  },
  {
    eventType: "MOVE_IN_SCHEDULED",
    language: "ar",
    subject: "تحديد موعد الاستلام - {{moveInNumber}}",
    bodyText: "تم تحديد موعد استلام الوحدة {{moveInNumber}} للعقد {{contractNumber}} (وحدة {{unitNumber}}) بتاريخ {{scheduledAt}}.",
  },
  {
    eventType: "MOVE_OUT_SCHEDULED",
    language: "en",
    subject: "Move-Out scheduled - {{moveOutNumber}}",
    bodyText: "Your Move-Out {{moveOutNumber}} for contract {{contractNumber}} (Unit {{unitNumber}}) has been scheduled for {{scheduledAt}}.",
  },
  {
    eventType: "MOVE_OUT_SCHEDULED",
    language: "ar",
    subject: "تحديد موعد إخلاء الوحدة - {{moveOutNumber}}",
    bodyText: "تم تحديد موعد إخلاء الوحدة {{moveOutNumber}} للعقد {{contractNumber}} (وحدة {{unitNumber}}) بتاريخ {{scheduledAt}}.",
  },
  {
    eventType: "SECURITY_DEPOSIT_SETTLEMENT_POSTED",
    language: "en",
    subject: "Security deposit settlement posted - {{settlementNumber}}",
    bodyText:
      "Your security deposit settlement {{settlementNumber}} for Unit {{unitNumber}} has been posted. Refund due: {{refundDue}} {{currency}}. Additional amount due: {{additionalDue}} {{currency}}.",
  },
  {
    eventType: "SECURITY_DEPOSIT_SETTLEMENT_POSTED",
    language: "ar",
    subject: "تم ترحيل تسوية التأمين - {{settlementNumber}}",
    bodyText: "تم ترحيل تسوية التأمين {{settlementNumber}} للوحدة {{unitNumber}}. المبلغ المسترد: {{refundDue}} {{currency}}. المبلغ الإضافي المستحق: {{additionalDue}} {{currency}}.",
  },
  {
    eventType: "SECURITY_DEPOSIT_REFUND_RECORDED",
    language: "en",
    subject: "Security deposit refund recorded - {{settlementNumber}}",
    bodyText: "A refund of {{refundAmount}} {{currency}} for settlement {{settlementNumber}} (Unit {{unitNumber}}) has been recorded via {{method}}.",
  },
  {
    eventType: "SECURITY_DEPOSIT_REFUND_RECORDED",
    language: "ar",
    subject: "تم تسجيل استرداد التأمين - {{settlementNumber}}",
    bodyText: "تم تسجيل استرداد بمبلغ {{refundAmount}} {{currency}} للتسوية {{settlementNumber}} (وحدة {{unitNumber}}) عبر {{method}}.",
  },
];

const WIRED_EVENTS_FOR_DEFAULT_RULES: CommunicationEventType[] = [
  "INVOICE_ISSUED",
  "PAYMENT_RECEIVED",
  "MAINTENANCE_REQUEST_CREATED",
  "MAINTENANCE_SCHEDULED",
  "MAINTENANCE_COMPLETED",
  "MOVE_IN_SCHEDULED",
  "MOVE_OUT_SCHEDULED",
  "SECURITY_DEPOSIT_SETTLEMENT_POSTED",
  "SECURITY_DEPOSIT_REFUND_RECORDED",
];

/**
 * Idempotent: safe to call multiple times for the same organization (e.g.
 * repeated demo-data seeding) - skips any (eventType, channel, language)
 * combination that already has a template, and any (eventType, channel,
 * recipientStrategy) that already has a rule, rather than erroring or
 * creating duplicates.
 */
export async function seedCommunicationDefaultsForOrganization(tx: Tx, organizationId: string, createdByUserId: string): Promise<void> {
  for (const content of DEFAULT_TEMPLATES) {
    const existing = await tx.communicationTemplate.findFirst({
      where: { organizationId, eventType: content.eventType, channel: "EMAIL", language: content.language },
    });
    if (existing) continue;

    const version = await nextCounterValue(tx, organizationId, `communicationTemplate:${content.eventType}:EMAIL:${content.language}`);
    await tx.communicationTemplate.create({
      data: {
        organizationId,
        eventType: content.eventType,
        channel: "EMAIL",
        language: content.language,
        version,
        status: "ACTIVE",
        subject: content.subject,
        bodyText: content.bodyText,
        variables: [...getEventDefinition(content.eventType).variables],
        createdByUserId,
        activatedAt: new Date(),
        activatedByUserId: createdByUserId,
      },
    });
  }

  for (const eventType of WIRED_EVENTS_FOR_DEFAULT_RULES) {
    const existing = await tx.communicationRule.findUnique({
      where: { organizationId_eventType_channel_recipientStrategy: { organizationId, eventType, channel: "EMAIL", recipientStrategy: "RENTER" } },
    });
    if (existing) continue;

    await tx.communicationRule.create({
      data: { organizationId, eventType, channel: "EMAIL", recipientStrategy: "RENTER", isEnabled: true, createdByUserId },
    });
  }
}

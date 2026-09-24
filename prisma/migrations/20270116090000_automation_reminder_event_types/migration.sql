-- Automation & Scheduled Jobs (Step 27): new CommunicationEventType values
-- emitted only by scheduled AutomationJob handlers.
ALTER TYPE "CommunicationEventType" ADD VALUE 'RENT_DUE_REMINDER';
ALTER TYPE "CommunicationEventType" ADD VALUE 'CONTRACT_EXPIRY_REMINDER';
ALTER TYPE "CommunicationEventType" ADD VALUE 'MOVE_IN_REMINDER';
ALTER TYPE "CommunicationEventType" ADD VALUE 'MOVE_OUT_REMINDER';

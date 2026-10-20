import {
  Zap,
  GitBranch,
  Mail,
  UserRoundCheck,
  Clock3,
  Tag,
  Bell,
  Webhook,
  MessageCircle,
  type LucideIcon,
} from 'lucide-react';
import type { BlockType } from '@eimax/workflow-schema';
export const blockIcons: Record<BlockType, LucideIcon> = {
  'whatsapp.message.received': MessageCircle,
  'whatsapp.conversation.started': MessageCircle,
  'whatsapp.text.send': MessageCircle,
  'whatsapp.template.send': MessageCircle,
  'whatsapp.sdr.notify': Bell,
  'lead.created': Zap,
  condition: GitBranch,
  'email.send': Mail,
  'sdr.assign': UserRoundCheck,
  wait: Clock3,
  'tag.add': Tag,
  'manager.notify': Bell,
  'webhook.received': Webhook,
};

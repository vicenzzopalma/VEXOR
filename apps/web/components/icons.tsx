
import {
  Zap,
  GitBranch,
  Mail,
  UserRoundCheck,
  Clock3,
  Tag,
  Bell,
  Webhook,
  type LucideIcon,
} from 'lucide-react';
import type { BlockType } from '@eimax/workflow-schema';
export const blockIcons: Record<BlockType, LucideIcon> = {
  'lead.created': Zap,
  condition: GitBranch,
  'email.send': Mail,
  'sdr.assign': UserRoundCheck,
  wait: Clock3,
  'tag.add': Tag,
  'manager.notify': Bell,
  'webhook.received': Webhook,
};

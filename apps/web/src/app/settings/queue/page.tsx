import { redirect } from 'next/navigation';

/** Legacy path — BullMQ ops UI moved to Background Jobs. */
export default function LegacyQueueSettingsRedirect() {
  redirect('/settings/jobs');
}

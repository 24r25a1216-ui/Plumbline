import { get, run } from './db.js';

interface NotificationEmail { complaintId?: number | null; title: string; body?: string }
function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

async function sendResend(to: string, subject: string, text: string, html: string, complaintId: number | null, recipientType: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim() || 'onboarding@resend.dev';
  if (!apiKey) {
    if (complaintId) run('INSERT INTO email_delivery_log (complaint_id, recipient, recipient_type, subject, status, error) VALUES (?,?,?,?,?,?)', complaintId, to, recipientType, subject, 'failed', 'RESEND_API_KEY is missing');
    console.warn('Email not sent: RESEND_API_KEY is missing.');
    return false;
  }
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html, text }),
    });
    const payload = await response.json().catch(() => ({})) as { id?: string; message?: string };
    if (!response.ok) throw new Error(payload.message || `Resend returned HTTP ${response.status}`);
    if (complaintId) run('INSERT INTO email_delivery_log (complaint_id, recipient, recipient_type, subject, status, provider_id) VALUES (?,?,?,?,?,?)', complaintId, to, recipientType, subject, 'accepted', payload.id ?? null);
    console.info(`Email accepted by Resend for ${recipientType}: ${to}`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
    if (complaintId) run('INSERT INTO email_delivery_log (complaint_id, recipient, recipient_type, subject, status, error) VALUES (?,?,?,?,?,?)', complaintId, to, recipientType, subject, 'failed', message);
    console.error(`Resend email failed for ${recipientType}: ${message}`);
    return false;
  }
}

/** Citizen updates are sent for every persisted citizen notification. */
export async function sendCitizenNotificationEmail(userId: number, notification: NotificationEmail) {
  const citizen = get<{ name: string; email: string; role: string }>('SELECT name, email, role FROM users WHERE id = ?', userId);
  if (!citizen || citizen.role !== 'citizen' || !citizen.email) return;
  const title = notification.title || 'Your Plumbline complaint has an update';
  const body = notification.body || 'There is a new update on your complaint.';
  const complaintRef = notification.complaintId ? get<{ ref: string }>('SELECT ref FROM complaints WHERE id = ?', notification.complaintId)?.ref : undefined;
  const text = `${title}\n\nHello ${citizen.name},\n\n${body}${complaintRef ? `\n\nComplaint reference: ${complaintRef}` : ''}\n\nSign in to Plumbline to view the latest details.`;
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#17212b;line-height:1.6"><h2>${escapeHtml(title)}</h2><p>Hello ${escapeHtml(citizen.name)},</p><p>${escapeHtml(body)}</p>${complaintRef ? `<p><strong>Complaint reference:</strong> ${escapeHtml(complaintRef)}</p>` : ''}<p>Sign in to Plumbline to view the latest details.</p><p style="color:#667085;font-size:12px">Automated notification from Plumbline.</p></body></html>`;
  await sendResend(citizen.email, title, text, html, notification.complaintId ?? null, 'citizen');
}

export async function sendAuthorityComplaintEmail(args: {
  complaintId: number; ref: string; title: string; body: string; citizenName: string;
  district: string | null; institution: string; departmentName: string; level: number; authorityName: string;
  designation: string; email: string; reason: string; history: string; attachments: string[];
}) {
  const subject = `Plumbline ${args.level > 1 ? 'Escalated Complaint' : 'New Complaint'} – ${args.ref}`;
  const text = `${subject}\n\nTo: ${args.authorityName || args.designation}\nDepartment: ${args.departmentName}\nInstitution: ${args.institution || 'Not specified'}\nDistrict: ${args.district || 'Not specified'}\nEscalation level: ${args.level}\nCitizen: ${args.citizenName}\nComplaint: ${args.title}\n\n${args.body}\n\n${args.reason}\n\nPrevious history:\n${args.history || 'No previous actions recorded.'}\n\nAttachments: ${args.attachments.length ? args.attachments.join(', ') : 'None'}\n\nPlease review this complaint and update its status through the Plumbline grievance system.`;
  const html = `<html><body style="font-family:Arial,sans-serif;line-height:1.6;color:#17212b"><h2>${escapeHtml(subject)}</h2><p><b>Authority:</b> ${escapeHtml(args.authorityName || args.designation)}</p><p><b>Department:</b> ${escapeHtml(args.departmentName)}<br><b>Institution:</b> ${escapeHtml(args.institution || 'Not specified')}<br><b>District:</b> ${escapeHtml(args.district || 'Not specified')}<br><b>Escalation level:</b> ${args.level}<br><b>Citizen:</b> ${escapeHtml(args.citizenName)}</p><h3>${escapeHtml(args.title)}</h3><p>${escapeHtml(args.body).replace(/\n/g, '<br>')}</p><p>${escapeHtml(args.reason)}</p><h3>Previous history</h3><p>${escapeHtml(args.history || 'No previous actions recorded.').replace(/\n/g, '<br>')}</p><p><b>Attachments:</b> ${escapeHtml(args.attachments.length ? args.attachments.join(', ') : 'None')}</p><p>Please review this complaint and update its status through the Plumbline grievance system.</p></body></html>`;
  return sendResend(args.email, subject, text, html, args.complaintId, 'authority');
}

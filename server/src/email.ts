import { get } from './db.js';

interface NotificationEmail {
  complaintId?: number | null;
  title: string;
  body?: string;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]!);
}

/** Sends citizen notification emails through Resend's HTTPS API. */
export async function sendCitizenNotificationEmail(userId: number, notification: NotificationEmail) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim() || 'onboarding@resend.dev';

  if (!apiKey) {
    console.warn('Email not sent: RESEND_API_KEY is missing.');
    return;
  }

  const citizen = get<{ name: string; email: string; role: string }>(
    'SELECT name, email, role FROM users WHERE id = ?', userId,
  );
  if (!citizen || citizen.role !== 'citizen' || !citizen.email) return;

  const title = notification.title || 'Your Plumbline complaint has an update';
  const body = notification.body || 'There is a new update on your complaint.';
  const complaintRef = notification.complaintId
    ? get<{ ref: string }>('SELECT ref FROM complaints WHERE id = ?', notification.complaintId)?.ref
    : undefined;
  const text = `${title}\n\nHello ${citizen.name},\n\n${body}${complaintRef ? `\n\nComplaint reference: ${complaintRef}` : ''}\n\nSign in to Plumbline to view the latest details.`;
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#17212b;line-height:1.6"><h2>${escapeHtml(title)}</h2><p>Hello ${escapeHtml(citizen.name)},</p><p>${escapeHtml(body)}</p>${complaintRef ? `<p><strong>Complaint reference:</strong> ${escapeHtml(complaintRef)}</p>` : ''}<p>Sign in to Plumbline to view the latest details.</p><p style="color:#667085;font-size:12px">This is an automated notification from Plumbline.</p></body></html>`;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [citizen.email], subject: title, html, text }),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    console.error(`Resend email failed (${response.status}): ${detail}`);
    return;
  }

  console.info(`Citizen email accepted by Resend for complaint ${complaintRef ?? notification.complaintId ?? 'notification'}.`);
}

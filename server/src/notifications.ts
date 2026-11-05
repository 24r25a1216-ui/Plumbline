
/**
 * Plumbline Gmail email notification service.
 * Existing in-app notifications remain in events.ts.
 */

import nodemailer from 'nodemailer';
import { config } from './config.js';
import { notify } from './events.js';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: config.email.user,
    pass: config.email.appPassword,
  },
});

function escapeHtml(value: unknown): string {
  const entities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };

  return String(value ?? '').replace(
    /[&<>"']/g,
    (character) => entities[character] ?? character,
  );
}

export async function sendEmail(
  to: string,
  subject: string,
  lines: string[],
): Promise<boolean> {
  if (
    !to ||
    !config.email.user ||
    !config.email.appPassword ||
    !config.email.from
  ) {
    console.warn('Email not sent: Gmail configuration is missing.');
    return false;
  }

  try {
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:20px;color:#202820">
        <h2 style="color:#355c48">Plumbline Grievance System</h2>
        ${lines.map(line => `<p>${escapeHtml(line)}</p>`).join('')}
        <hr>
        <p style="font-size:12px;color:#667">
          This is an automated notification from Plumbline.
        </p>
      </div>
    `;

    const result = await transporter.sendMail({
      from: config.email.from,
      to,
      subject,
      text: lines.join('\n'),
      html,
    });

    console.log('Email sent successfully:', result.messageId);
    return true;
  } catch (error) {
    console.error('Gmail delivery failed:', error);
    return false;
  }
}
export async function sendBothNotifications(
  user: { id: number; email: string },
  title: string,
  message: string,
  complaintId?: number,
): Promise<void> {
  notify(user.id, {
    complaintId: complaintId ?? null,
    kind: 'info',
    title,
    body: message,
  });

  await sendEmail(user.email, title, [message]);
}
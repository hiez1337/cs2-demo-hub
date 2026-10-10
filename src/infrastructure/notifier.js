import { execFile } from 'child_process';

export function sanitizeXml(str) {
  if (!str && str !== 0) return '';
  const map = {
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;',
    "'": '&apos;',
  };
  return String(str).replace(/[<>&"']/g, (c) => map[c] || c);
}

export function sendToast(title, body) {
  if (process.platform !== 'win32') return;

  const safeTitle = sanitizeXml(title).slice(0, 100).replace(/[`$]/g, '`$&');
  const safeBody = sanitizeXml(body).slice(0, 200).replace(/[`$]/g, '`$&');

  const psScript = [
    '[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null',
    '$template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)',
    '$textNodes = $template.GetElementsByTagName("text")',
    `$textNodes.Item(0).AppendChild($template.CreateTextNode("${safeTitle}")) > $null`,
    `$textNodes.Item(1).AppendChild($template.CreateTextNode("${safeBody}")) > $null`,
    '$toast = [Windows.UI.Notifications.ToastNotification]::new($template)',
    '[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("CSREP Uploader").Show($toast)'
  ].join('; ');

  try {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript], () => {});
  } catch {}
}

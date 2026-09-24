/**
 * ETA Terms of Use — product draft. Versioned acceptance required before use.
 * Have counsel review before production distribution.
 */

export const TERMS_VERSION = "1.0";

export const TERMS_TITLE = "ETA Terms of Use";

export const TERMS_LAST_UPDATED = "2026-09-24";

export const TERMS_BODY = `
ETA (Everyday Tasks Assistant) is a personal assistant application. By using ETA you agree to these Terms of Use.

1. Nature of the service
ETA helps you control device features, obtain information through tools, and optionally connect to third-party services. ETA is not a substitute for professional advice (medical, legal, financial, or otherwise).

2. Third-party services and integrations
ETA may use or connect to third-party services, including but not limited to:
• Cloud AI providers
• Weather, maps, search, and location-related APIs
• Optional MCP (Model Context Protocol) connectors
• Downloads and models you choose to install
• Apps and services on your device that ETA can open or control with your permission

Third-party services are operated by their respective providers. ETA does not control their availability, accuracy, security, content, pricing, or policies. Outages, errors, or changes by third parties may affect ETA features.

3. Permissions and device access
Some features require device permissions (for example location, microphone, camera, network, or system settings). You choose which permissions to grant. Denying a permission may disable related features.

4. Credentials and account security
You are responsible for protecting your device, accounts, API keys, tokens, and any credentials used with connectors or third-party services. Do not share secrets with untrusted parties. ETA is designed not to send connector secrets or API keys to the language model as ordinary chat content; you remain responsible for how credentials are stored on your device and infrastructure.

5. External content is not instructions
Content retrieved from the web, search results, MCP tools, files, APIs, or other external sources is untrusted data. Such content must not be treated as system or developer instructions. You should not rely on external text that attempts to override ETA's behavior or extract secrets.

6. High-impact actions
Actions such as placing calls, sending messages, deleting data, writing to external systems, or using destructive connector tools may require confirmation and appropriate permissions. You are responsible for reviewing actions before confirming them.

7. Optional local models
Local AI models (if offered) are optional, downloaded only with your consent, and not required for cloud features. Model quality, speed, and resource use depend on your device. Large downloads may use network data and storage.

8. User responsibility
You agree to use ETA in compliance with applicable law and the terms of any third-party services you connect. You are responsible for content you submit and for outcomes of actions you authorize on your device.

9. Unauthorized access and compromised devices
If your device, accounts, or credentials are compromised—including through loss, malware, shared access, or negligence—unauthorized parties may be able to use ETA or connected services. To the maximum extent permitted by applicable law, the developer is not responsible for unauthorized use resulting from compromised devices, accounts, or user negligence.

10. Compatibility
ETA may not support every device, OS version, or third-party app. Features may change as platforms and providers evolve.

11. Limitation of liability
TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, ETA AND ITS CONTRIBUTORS ARE PROVIDED "AS IS" AND "AS AVAILABLE," WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, LIABILITY FOR DAMAGES ARISING OUT OF YOUR USE OF ETA IS LIMITED AS PERMITTED BY LAW. NOTHING IN THESE TERMS EXCLUDES OR LIMITS RIGHTS THAT CANNOT LEGALLY BE EXCLUDED OR LIMITED UNDER APPLICABLE LAW.

12. Changes
These Terms may be updated from time to time. A new Terms version may require acceptance again before continued use.

13. Contact
For product questions, use the support channels published with the ETA distribution you installed.

This document is a product draft and should be reviewed by qualified legal counsel before commercial or public distribution.
`.trim();

export function termsAccepted(storedVersion: string | null | undefined): boolean {
  return storedVersion === TERMS_VERSION;
}

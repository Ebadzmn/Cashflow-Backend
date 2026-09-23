import os from 'os';

type ServerBannerOptions = {
  port: number | string;
  ipAddress?: string;
  nodeEnv?: string;
  dbStatus?: string;
};

// Regex to strip ANSI escape codes for accurate string length measurement
const stripAnsi = (str: string): string => {
  /* eslint-disable-next-line no-control-regex */
  return str.replace(/\x1b\[[0-9;]*m/g, '');
};

export const getNetworkIpAddresses = (): string[] => {
  const interfaces = os.networkInterfaces();
  const addresses: string[] = [];

  for (const name of Object.keys(interfaces)) {
    const netList = interfaces[name];
    if (!netList) continue;

    for (const net of netList) {
      // Pick active IPv4 addresses that are not loopback/internal
      if (net.family === 'IPv4' && !net.internal && net.address) {
        addresses.push(net.address);
      }
    }
  }

  return Array.from(new Set(addresses));
};

export const printServerBanner = ({
  port,
  ipAddress,
  nodeEnv = 'development',
  dbStatus = 'Connected',
}: ServerBannerOptions): void => {
  const reset = '\x1b[0m';
  const bold = '\x1b[1m';
  const dim = '\x1b[2m';
  const cyan = '\x1b[36m';
  const brightCyan = '\x1b[96m';
  const green = '\x1b[32m';
  const brightGreen = '\x1b[92m';
  const yellow = '\x1b[33m';
  const magenta = '\x1b[35m';
  const white = '\x1b[97m';

  const networkIps = getNetworkIpAddresses();
  const primaryIp =
    ipAddress && ipAddress !== '0.0.0.0' && ipAddress !== '127.0.0.1'
      ? ipAddress
      : networkIps[0] || '127.0.0.1';

  const localUrl = `http://localhost:${port}`;
  const networkUrl = `http://${primaryIp}:${port}`;
  const apiUrl = `${localUrl}/api/v1`;
  const healthUrl = `${localUrl}/health/live`;

  const rows: Array<{ type: 'empty' | 'text'; content?: string }> = [
    { type: 'empty' },
    {
      type: 'text',
      content: `  ${bold}${brightGreen}🚀 CashFlowIQ API Server${reset} ${dim}(v1.0.0)${reset}`,
    },
    { type: 'empty' },
    {
      type: 'text',
      content: `  ${dim}•${reset} ${white}Environment :${reset} ${magenta}${nodeEnv}${reset}`,
    },
    {
      type: 'text',
      content: `  ${dim}•${reset} ${white}Port        :${reset} ${yellow}${bold}${port}${reset}`,
    },
    {
      type: 'text',
      content: `  ${dim}•${reset} ${white}Database    :${reset} ${green}✔ ${dbStatus}${reset}`,
    },
    {
      type: 'text',
      content: `  ${dim}•${reset} ${white}Socket.IO   :${reset} ${green}✔ Ready${reset}`,
    },
    { type: 'empty' },
    {
      type: 'text',
      content: `  ${bold}${brightCyan}➜ Local:${reset}       ${brightCyan}${localUrl}/${reset}`,
    },
    {
      type: 'text',
      content: `  ${bold}${brightGreen}➜ Network IP:${reset}  ${brightGreen}${networkUrl}/${reset}`,
    },
    {
      type: 'text',
      content: `  ${bold}${yellow}➜ API Base:${reset}    ${yellow}${apiUrl}${reset}`,
    },
    {
      type: 'text',
      content: `  ${bold}${white}➜ Health:${reset}      ${dim}${healthUrl}${reset}`,
    },
  ];

  const otherIps = networkIps.filter(ip => ip !== primaryIp);
  if (otherIps.length > 0) {
    rows.push({ type: 'empty' });
    for (const otherIp of otherIps) {
      rows.push({
        type: 'text',
        content: `  ${dim}• Alt Network:${reset} ${brightGreen}http://${otherIp}:${port}/${reset}`,
      });
    }
  }

  rows.push({ type: 'empty' });

  // Calculate box width dynamically
  let maxContentWidth = 64;
  for (const row of rows) {
    if (row.type === 'text' && row.content) {
      const visibleLength = stripAnsi(row.content).length;
      if (visibleLength + 4 > maxContentWidth) {
        maxContentWidth = visibleLength + 4;
      }
    }
  }

  const topBorder = `${cyan}┌${'─'.repeat(maxContentWidth)}┐${reset}`;
  const bottomBorder = `${cyan}└${'─'.repeat(maxContentWidth)}┘${reset}`;

  const lines: string[] = ['', topBorder];

  for (const row of rows) {
    if (row.type === 'empty') {
      lines.push(`${cyan}│${' '.repeat(maxContentWidth)}│${reset}`);
    } else if (row.type === 'text' && row.content) {
      const visibleLength = stripAnsi(row.content).length;
      const padding = Math.max(0, maxContentWidth - visibleLength);
      lines.push(
        `${cyan}│${reset}${row.content}${' '.repeat(padding)}${cyan}│${reset}`,
      );
    }
  }

  lines.push(bottomBorder, '');

  process.stdout.write(lines.join('\n') + '\n');
};

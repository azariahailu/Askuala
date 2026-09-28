import os from "node:os";

function score(ip: string) {
  if (ip.startsWith("192.168.")) return 0;
  if (ip.startsWith("10.")) return 1;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return 2;
  return 3;
}

export function lanUrls(port = Number(process.env.PORT || process.env.ASKUALA_PORT || 3000)) {
  const ips: string[] = [];
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const n of nets || []) {
      const v4 = String(n.family) === "IPv4" || String(n.family) === "4";
      if (v4 && !n.internal) ips.push(n.address);
    }
  }
  ips.sort((a, b) => score(a) - score(b) || a.localeCompare(b));
  return [...new Set(ips)].map((ip) => `http://${ip}:${port}`);
}

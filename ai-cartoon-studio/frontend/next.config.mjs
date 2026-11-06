const API = process.env.ACS_API_URL || "http://127.0.0.1:8000";
export default {
  reactStrictMode: true,
  output: "standalone",
  async rewrites() { return [{ source: "/api/:path*", destination: `${API}/api/:path*` }]; },
};

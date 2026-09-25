import type { MetadataRoute } from "next";

// Makes HRM installable ("Add to Home Screen") and open full-screen.
// No service worker: the app needs the network, offline isn't a goal.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "HRM · Internal HR",
    short_name: "HRM",
    description: "Internal HR management tool",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

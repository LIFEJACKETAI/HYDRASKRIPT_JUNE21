import { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "HydraSkript — AI-Powered Book Generation Platform",
    template: "%s | HydraSkript",
  },
  description: "Create full-length books with chapters, illustrations, and custom writing styles — all from a single prompt. Powered by AI.",
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-[#09090b]">
      {children}
    </div>
  );
}

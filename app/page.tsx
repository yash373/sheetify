"use client";

import dynamic from "next/dynamic";
import { HomePage } from "@/components/home-page";

const ClientHomePage = dynamic(() => Promise.resolve(HomePage), { ssr: false });

export default function Home() {
  return <ClientHomePage />;
}

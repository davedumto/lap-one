'use client';

import dynamic from 'next/dynamic';

const LapOneEngine = dynamic(() => import('@/components/LapOneEngine'), { ssr: false });

export default function Home() {
  return <LapOneEngine />;
}

import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'GEONOS — NYC Building Atlas',description:'Explore NYC on one map. Click a building for its evidence, select two to compare, and ask Meta about your selected places.',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en"><body>{children}</body></html>}

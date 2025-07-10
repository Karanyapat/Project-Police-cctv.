import Head from 'next/head';
import Home from '../components/Home';

export default function Index() {
  return (
    <>
      <Head>
        <title>Home Page</title>
        <link rel="icon" href="/police-logo.png" />
        <meta name="description" content="ยินดีต้อนรับสู่เว็บไซต์ของฉัน" />
      </Head>
      <Home />
    </>
  );
}

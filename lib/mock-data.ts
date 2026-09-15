export type MediaRow = {
  media: string;
  className: string;
  measurement: "Performance" | "Delivery" | "Live Only";
  spend: string;
  impressions: string;
  clicks: string;
  ctr: string;
  conversions: string;
  status: "LIVE" | "REVIEW" | "ENDED";
};

export const mediaRows: MediaRow[] = [
  { media: "Meta", className: "meta", measurement: "Performance", spend: "₩18.4M", impressions: "4.82M", clicks: "61.2K", ctr: "1.27%", conversions: "418", status: "LIVE" },
  { media: "NAVER GFA", className: "naver", measurement: "Performance", spend: "₩14.8M", impressions: "5.21M", clicks: "37.6K", ctr: "0.72%", conversions: "162", status: "LIVE" },
  { media: "Google", className: "google", measurement: "Performance", spend: "₩11.2M", impressions: "2.91M", clicks: "40.3K", ctr: "1.38%", conversions: "221", status: "LIVE" },
  { media: "Kakao", className: "kakao", measurement: "Performance", spend: "₩8.6M", impressions: "3.77M", clicks: "29.1K", ctr: "0.77%", conversions: "104", status: "LIVE" },
  { media: "TVING", className: "tving", measurement: "Delivery", spend: "₩7.2M", impressions: "1.34M", clicks: "-", ctr: "-", conversions: "-", status: "LIVE" },
  { media: "Focus Media", className: "atl", measurement: "Live Only", spend: "₩16.0M", impressions: "-", clicks: "-", ctr: "-", conversions: "-", status: "LIVE" }
];

export const creatives = [
  {
    id: "meta-feed-01",
    channel: "META",
    title: "40주년 정성편 15s",
    subtitle: "Instagram Feed · 09.01–09.30",
    status: "LIVE",
    type: "feed",
    measurement: "Performance",
    spend: "₩4.2M",
    ctr: "1.42%",
    cv: "96",
    landing: "https://example.com/jacomo/40th",
    tracking: "https://example.com/jacomo/40th?utm_source=meta&utm_medium=paid_social&utm_campaign=jacomo_40th_2609&utm_content=jeongseong_15s_a"
  },
  {
    id: "naver-native-01",
    channel: "NAVER GFA",
    title: "프리미엄 가죽 소재 A",
    subtitle: "Native Feed · 09.03–09.30",
    status: "LIVE",
    type: "feed",
    measurement: "Performance",
    spend: "₩3.8M",
    ctr: "0.81%",
    cv: "41",
    landing: "https://example.com/jacomo/leather",
    tracking: "https://example.com/jacomo/leather?utm_source=naver&utm_medium=display&utm_campaign=jacomo_leather_2609&utm_content=leather_a"
  },
  {
    id: "focus-ooh-01",
    channel: "FOCUS MEDIA",
    title: "40주년 CF 30s",
    subtitle: "Elevator TV · 서울/경기 · 09.01–09.30",
    status: "LIVE",
    type: "ooh",
    measurement: "Live Only",
    spend: "-",
    ctr: "-",
    cv: "-",
    landing: "-",
    tracking: "-"
  },
  {
    id: "tving-video-01",
    channel: "TVING",
    title: "정성편 Pre-roll 30s",
    subtitle: "CTV/OTT · 09.05–09.25",
    status: "LIVE",
    type: "video",
    measurement: "Delivery",
    spend: "₩2.4M",
    ctr: "VTR 82.4%",
    cv: "1.2M IMP",
    landing: "https://example.com/jacomo/brand",
    tracking: "https://example.com/jacomo/brand?utm_source=tving&utm_medium=video&utm_campaign=jacomo_brand_2609&utm_content=jeongseong_30s"
  },
  {
    id: "google-video-01",
    channel: "GOOGLE",
    title: "브랜드 필름 15s",
    subtitle: "YouTube · 09.01–09.30",
    status: "LIVE",
    type: "video",
    measurement: "Performance",
    spend: "₩3.1M",
    ctr: "0.64%",
    cv: "57",
    landing: "https://example.com/jacomo/showroom",
    tracking: "https://example.com/jacomo/showroom?utm_source=google&utm_medium=video&utm_campaign=jacomo_40th_2609&utm_content=brandfilm_15s"
  },
  {
    id: "bus-ooh-01",
    channel: "SEOUL BUS TV",
    title: "신규 CF 런칭 소재",
    subtitle: "Bus TV · 서울 · 09.10–09.30",
    status: "LIVE",
    type: "ooh",
    measurement: "Live Only",
    spend: "-",
    ctr: "-",
    cv: "-",
    landing: "-",
    tracking: "-"
  }
] as const;

export const spendTrend = [28, 34, 31, 43, 47, 52, 50, 59, 61, 67, 72, 76, 81, 85, 91];
export const planTrend = [30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100];

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
  pacing: number | null;
  goal: string;
  trend: string;
};

export const mediaRows: MediaRow[] = [
  { media: "Meta", className: "meta", measurement: "Performance", spend: "₩18.4M", impressions: "4.82M", clicks: "61.2K", ctr: "1.27%", conversions: "418", status: "LIVE", pacing: 76, goal: "CPA ₩44K", trend: "+8.6%" },
  { media: "NAVER", className: "naver", measurement: "Performance", spend: "₩14.8M", impressions: "5.21M", clicks: "37.6K", ctr: "0.72%", conversions: "162", status: "LIVE", pacing: 69, goal: "CTR 0.70%", trend: "+2.1%" },
  { media: "DV360", className: "dv360", measurement: "Delivery", spend: "₩11.2M", impressions: "2.91M", clicks: "40.3K", ctr: "1.38%", conversions: "-", status: "LIVE", pacing: 63, goal: "VTR 78%", trend: "+4.3%" },
  { media: "Kakao", className: "kakao", measurement: "Performance", spend: "₩8.6M", impressions: "3.77M", clicks: "29.1K", ctr: "0.77%", conversions: "104", status: "LIVE", pacing: 57, goal: "CPA ₩82K", trend: "-1.4%" },
  { media: "TVING", className: "tving", measurement: "Delivery", spend: "₩7.2M", impressions: "1.34M", clicks: "-", ctr: "-", conversions: "-", status: "LIVE", pacing: 71, goal: "VTR 80%", trend: "+3.8%" },
  { media: "Focus Media", className: "atl", measurement: "Live Only", spend: "₩16.0M", impressions: "-", clicks: "-", ctr: "-", conversions: "-", status: "LIVE", pacing: 60, goal: "게재 확인", trend: "정상" }
];

export const creatives = [
  {
    id: "meta-feed-01",
    channel: "META",
    platformClass: "meta",
    title: "40주년 정성편 15s",
    subtitle: "Instagram Feed · 09.01–09.30",
    placement: "Instagram Feed",
    status: "LIVE",
    type: "meta",
    measurement: "Performance",
    spend: "₩4.2M",
    ctr: "CTR 1.42%",
    cv: "CV 96",
    landing: "https://example.com/jacomo/40th",
    tracking: "https://example.com/jacomo/40th?utm_source=meta&utm_medium=paid_social&utm_campaign=jacomo_40th_2609&utm_content=jeongseong_15s_a"
  },
  {
    id: "naver-native-01",
    channel: "NAVER",
    platformClass: "naver",
    title: "프리미엄 가죽 소재 A",
    subtitle: "Native Feed · 09.03–09.30",
    placement: "NAVER Native",
    status: "LIVE",
    type: "naver",
    measurement: "Performance",
    spend: "₩3.8M",
    ctr: "CTR 0.81%",
    cv: "CV 41",
    landing: "https://example.com/jacomo/leather",
    tracking: "https://example.com/jacomo/leather?utm_source=naver&utm_medium=display&utm_campaign=jacomo_leather_2609&utm_content=leather_a"
  },
  {
    id: "kakao-bizboard-01",
    channel: "KAKAO",
    platformClass: "kakao",
    title: "40주년 비즈보드 B",
    subtitle: "Kakao Bizboard · 09.08–09.30",
    placement: "Kakao Bizboard",
    status: "LIVE",
    type: "kakao",
    measurement: "Performance",
    spend: "₩2.9M",
    ctr: "CTR 0.93%",
    cv: "CV 36",
    landing: "https://example.com/jacomo/40th",
    tracking: "https://example.com/jacomo/40th?utm_source=kakao&utm_medium=display&utm_campaign=jacomo_40th_2609&utm_content=bizboard_b"
  },
  {
    id: "dv360-video-01",
    channel: "DV360",
    platformClass: "dv360",
    title: "브랜드 필름 15s",
    subtitle: "Video Inventory · 09.01–09.30",
    placement: "DV360 Video",
    status: "LIVE",
    type: "video",
    measurement: "Delivery",
    spend: "₩3.1M",
    ctr: "VTR 81.6%",
    cv: "2.1M IMP",
    landing: "https://example.com/jacomo/showroom",
    tracking: "https://example.com/jacomo/showroom?utm_source=dv360&utm_medium=video&utm_campaign=jacomo_40th_2609&utm_content=brandfilm_15s"
  },
  {
    id: "tving-video-01",
    channel: "TVING",
    platformClass: "tving",
    title: "정성편 Pre-roll 30s",
    subtitle: "CTV/OTT · 09.05–09.25",
    placement: "TVING Pre-roll",
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
    id: "focus-ooh-01",
    channel: "FOCUS MEDIA",
    platformClass: "atl",
    title: "40주년 CF 30s",
    subtitle: "Elevator TV · 서울/경기 · 09.01–09.30",
    placement: "Elevator TV",
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
    id: "bus-ooh-01",
    channel: "SEOUL BUS TV",
    platformClass: "atl",
    title: "신규 CF 런칭 소재",
    subtitle: "Bus TV · 서울 · 09.10–09.30",
    placement: "Seoul Bus TV",
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

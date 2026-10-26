import existingSources from '../public/media-icons/sources.json';
import performanceSources from '../public/media-icons/performance-sources.json';
import executionSources from '../public/media-icons/execution-sources.json';

type IdentityDefinition = { key: string; aliases: string[]; short: string; kind: 'digital'|'video'|'tv'|'ooh'|'cinema'|'other'; color: string; background: string };
const definitions: IdentityDefinition[] = [
  {key:'naver',aliases:['네이버','네이버 GFA','NAVER','NAVER GFA','GFA'],short:'N',kind:'digital',color:'#087d3c',background:'#e8f8ee'},
  {key:'kakao',aliases:['카카오','카카오모먼트','카카오 moment','kakao','kakao moment','카카오키워드','카카오검색광고'],short:'K',kind:'digital',color:'#4a3715',background:'#fff6ce'},
  {key:'hogangnono',aliases:['호갱노노','hogangnono'],short:'호갱',kind:'digital',color:'#5136aa',background:'#f0eafb'},
  {key:'zigbang',aliases:['직방','zigbang'],short:'직방',kind:'digital',color:'#9b420e',background:'#fff0e4'},
  {key:'karrot',aliases:['당근','당근마켓','karrot'],short:'당근',kind:'digital',color:'#a54513',background:'#fff0e7'},
  {key:'kidsnote',aliases:['키즈노트','kidsnote'],short:'키즈',kind:'digital',color:'#1747a6',background:'#edf3ff'},
  {key:'mamitalk',aliases:['마미톡','mamitalk'],short:'마미',kind:'digital',color:'#a12469',background:'#fcecf4'},
  {key:'tiktok',aliases:['틱톡','tiktok'],short:'TT',kind:'video',color:'#172b3a',background:'#e7f7fa'},
  {key:'dv360',aliases:['DV360','Display & Video 360','DisplayVideo360'],short:'DV',kind:'digital',color:'#18653a',background:'#eaf5ed'},
  {key:'netflix',aliases:['넷플릭스','Netflix'],short:'NF',kind:'video',color:'#ad1521',background:'#ffedf0'},
  {key:'youtube',aliases:['유튜브','YouTube','youtu.be'],short:'YT',kind:'video',color:'#ad1521',background:'#fff0f0'},
  {key:'tving',aliases:['티빙','TVING'],short:'TVG',kind:'video',color:'#9c143d',background:'#ffedf3'},
  {key:'addressable-tv',aliases:['어드레서블TV','Addressable TV','Addr.TV'],short:'ATV',kind:'tv',color:'#304d9c',background:'#ebf0ff'},
  {key:'adboost-screen',aliases:['애드부스트스크린','애드부스트','애드부스터스크린','애드부스터','애드부스트스크린(DOOH)','ADVoost Screen','ADVoost스크린'],short:'애드',kind:'ooh',color:'#38652c',background:'#eef6e8'},
  {key:'adpacker',aliases:['애드패커','Adpacker','ADpacker'],short:'AP',kind:'digital',color:'#9d244b',background:'#fff0f5'},
  {key:'lg-uplus',aliases:['LG U+','LGU+','LG유플러스','엘지유플러스','U+tv','어드레서블TV(LG U+)','Addressable TV (LG U+)'],short:'U+',kind:'tv',color:'#ad006c',background:'#fff0fa'},
  {key:'sk-broadband',aliases:['SKB','SK broadband','SK브로드밴드','B tv','어드레서블TV(SKB)','Addressable TV (SKB)'],short:'SKB',kind:'tv',color:'#a92420',background:'#fff1ed'},
  {key:'tv',aliases:['TV','TV 방송','방송'],short:'TV',kind:'tv',color:'#374b70',background:'#edf0f8'},
  {key:'sbs',aliases:['SBS','SBS-TV'],short:'SBS',kind:'tv',color:'#175894',background:'#eaf4ff'},
  {key:'mbc',aliases:['MBC','MBC-TV'],short:'MBC',kind:'tv',color:'#54505f',background:'#f1eff7'},
  {key:'kbs1',aliases:['KBS1','KBS1-TV','KBS 1TV'],short:'K1',kind:'tv',color:'#15568a',background:'#eaf3ff'},
  {key:'kbs2',aliases:['KBS2','KBS2-TV','KBS 2TV'],short:'K2',kind:'tv',color:'#245d6b',background:'#eaf7f9'},
  {key:'tvn',aliases:['tvN','tvN-TV'],short:'tvN',kind:'tv',color:'#ac2735',background:'#fff0f2'},
  {key:'jtbc',aliases:['JTBC','JTBC-TV'],short:'JTBC',kind:'tv',color:'#5b349d',background:'#f3edff'},
  {key:'cgv',aliases:['CGV'],short:'CGV',kind:'cinema',color:'#a12b28',background:'#fff0ed'},
  {key:'megabox',aliases:['메가박스','MEGABOX'],short:'MEGA',kind:'cinema',color:'#58308f',background:'#f3edfb'},
  {key:'lotte-cinema',aliases:['롯데시네마','LOTTE CINEMA'],short:'롯데',kind:'cinema',color:'#a22a35',background:'#ffeff1'},
];
const keyOf = (value:string) => value.normalize('NFKC').toLocaleLowerCase('en-US').replace(/[\s._()/·&-]/g,'');
const palette = [['#344d91','#eef2ff'],['#71419a','#f7effc'],['#8c4425','#fff1e9'],['#22606a','#eaf8fa'],['#805e16','#fff8df'],['#395d3b','#edf6ed']] as const;
/** Presentation only. Exact aliases avoid incorrectly branding combined or unknown sources. */
export function mediaIdentity(media: string, placement?: string) {
  const name = media.trim() || '미확인';
  const normalized = keyOf(name);
  let definition = definitions.find(item=>item.aliases.some(alias=>keyOf(alias)===normalized));
  // Addressable TV is a buying method, not a brand. Resolve only an exact single
  // operator supplied by the caller. Mixed/unknown detail never inherits a logo.
  if (definition?.key === 'addressable-tv' && placement) {
    const operator = definitions.find(item => ['lg-uplus','sk-broadband'].includes(item.key) && item.aliases.some(alias => keyOf(alias) === keyOf(placement.trim())));
    if (operator) definition = operator;
  }
  const source = definition && [...existingSources,...performanceSources,...executionSources].find(item=>item.key===definition.key);
  let hash=0;for(const character of name) hash=(Math.imul(hash,31)+character.codePointAt(0)!)>>>0;
  const colors=palette[hash%palette.length];
  const words=name.match(/[A-Za-z0-9]+|[가-힣]/g)||['?'];
  const short=words.length===1?Array.from(words[0]).slice(0,3).join('').toUpperCase():words.slice(0,2).map(word=>Array.from(word)[0]).join('').toUpperCase();
  return {key:definition?.key||`source-${hash.toString(36)}`,name,short:definition?.short||short,kind:definition?.kind||'other',color:definition?.color||colors[0],background:definition?.background||colors[1],src:source?.src||null,logoFormat:source && 'logoFormat' in source ? source.logoFormat : 'icon'};
}

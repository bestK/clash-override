// ============================================================
// Clash 覆写脚本
// ============================================================

// ------------------------------------------------------------
// 机器开关
// 三台机器共用这一份脚本，复制到目标机器后只改下面这一行：
//   'home-imac'    家 iMac：Apple Music DNS 修复 + Tailscale MagicDNS
//   'home-macmini' 家 Mac mini：在上面基础上让 cloudflared 直连 CF 边缘
//                  （这台机器是 zeeho 等域名的 Cloudflare Tunnel 宿主）
//   'windows'      Windows / Mihomo Party
// ------------------------------------------------------------
const MACHINE = 'home-imac';

const MACHINE_PROFILES = {
    'home-imac': {
        dnsOverride: true,      // 用脚本内置的精简 fake-ip DNS 覆盖订阅 DNS
                                // (订阅私有 DoH 递归出口在日本,who.1ms.dog 报"DNS 泄露:解析器在日本,IP 在新加坡")
        appleDnsFix: true,      // Apple Music CNAME 链修复（切 fake-ip）
        tailnetDns: true,       // Tailscale MagicDNS 定向分流
        cfTunnelDirect: false   // Cloudflare Tunnel 边缘直连
    },
    'home-macmini': {
        dnsOverride: false,
        appleDnsFix: true,
        tailnetDns: true,
        cfTunnelDirect: true
    },
    'windows': {
        dnsOverride: false,
        appleDnsFix: false,
        tailnetDns: true,
        cfTunnelDirect: false
    }
};

const MACHINE_CONFIG = MACHINE_PROFILES[MACHINE] || MACHINE_PROFILES['home-imac'];

// 需要排除的节点名称正则（排除下载/测试/充值等非节点条目）
const excludeRegex = /^(?!.*(下载|测试|充值|余额|分割线|群|官网|失联|邮件)).*/u;

// 按地区/用途分组的正则
const REGION_REGEX = {
    hk: /🇭🇰|港|HK|Hong Kong|HongKong|hongkong/i,
    tw: /🇨🇳|台|新北|彰化|TW|Taiwan/i,
    jp: /🇯🇵|日本|川日|东京|大阪|泉日|埼玉|沪日|深日|\bJP\b|Japan|京/i,
    us: /🇺🇸|美国|波特兰|达拉斯|俄勒冈|凤凰城|费利蒙|硅谷|拉斯维加斯|洛杉矶|圣何塞|圣克拉拉|西雅图|芝加哥|\bUS\b|United States/i,
    sg: /🇸🇬|新加坡|坡|狮城|\bSG\b|Singapore/i,
    kr: /🇰🇷|\bKR\b|Korea|KOR|首尔|韩|韓/i,
    uk: /🇬🇧|英格兰|英国|伦敦|\bUK\b|United Kingdom/i,
    nl: /🇳🇱|荷兰|Netherlands|Holland/i,
    ru: /🇷🇺|俄罗斯|Russia/i,
    de: /🇩🇪|德国|Germany|Deutschland/i,
    ch: /🇨🇭|瑞士|Switzerland/i,
    fr: /🇫🇷|法国|France/i,
    se: /🇸🇪|瑞典|Sweden/i,
    bg: /🇧🇬|保加利亚|Bulgaria/i,
    at: /🇦🇹|奥地利|Austria/i,
    ie: /🇮🇪|爱尔兰|Ireland/i,
    tr: /🇹🇷|土耳其|Turkey|Türkiye/i,
    hu: /🇭🇺|匈牙利|Hungary/i,
    ca: /🇨🇦|加拿大|Canada/i,
    au: /🇦🇺|澳大利亚|Australia/i,
    ae: /🇦🇪|阿联酋|United Arab Emirates|UAE/i,
    in: /🇮🇳|印度|India/i,
    id: /🇮🇩|印度尼西亚|Indonesia/i,
    br: /🇧🇷|巴西|Brazil/i,
    ar: /🇦🇷|阿根廷|Argentina/i,
    cl: /🇨🇱|智利|Chile/i
};
const nfRegex = /NF|奈飞|解锁|Netflix|NETFLIX|Media/i;
const neteaseMusicRegex = /网易|音乐|解锁|Music|NetEase/i;

// ------------------------------------------------------------
// 规则集（rule-providers）构造工具
// ------------------------------------------------------------
const RP_INTERVAL = 86400;

function makeProvider(url, behavior, path, format = 'yaml') {
    return { type: 'http', format, interval: RP_INTERVAL, behavior, url, path };
}

// Loyalsoldier clash-rules
function loyal(name, behavior) {
    return makeProvider(
        `https://fastly.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/${name}.txt`,
        behavior,
        `./ruleset/loyalsoldier/${name}.yaml`
    );
}

// ACL4SSR（Clash 目录，部分在 Ruleset 子目录）
function acl(name, behavior, sub = '') {
    return makeProvider(
        `https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/${sub}${name}.list`,
        behavior,
        `./ruleset/${name}.yaml`
    );
}

const ruleProviders = {
    // Loyalsoldier
    reject: loyal('reject', 'domain'),
    icloud: loyal('icloud', 'domain'),
    apple: loyal('apple', 'domain'),
    google: loyal('google', 'domain'),
    proxy: loyal('proxy', 'domain'),
    direct: loyal('direct', 'domain'),
    private: loyal('private', 'domain'),
    gfw: loyal('gfw', 'domain'),
    'tld-not-cn': loyal('tld-not-cn', 'domain'),
    telegramcidr: loyal('telegramcidr', 'ipcidr'),
    cncidr: loyal('cncidr', 'ipcidr'),
    lancidr: loyal('lancidr', 'ipcidr'),
    applications: loyal('applications', 'classical'),

    // VPSDance 综合海外 AI 规则集（OpenAI / Anthropic / Google AI / xAI / Copilot / Cursor 等）
    AIProxy: makeProvider(
        'https://cdn.jsdelivr.net/gh/VPSDance/ai-proxy-rules@main/rules/clash/global.yaml',
        'classical',
        './ruleset/AIProxy.yaml'
    ),

    // ACL4SSR（Clash/ 根目录）
    LocalAreaNetwork: acl('LocalAreaNetwork', 'classical'),
    UnBan: acl('UnBan', 'classical'),
    BanAD: acl('BanAD', 'classical'),
    BanProgramAD: acl('BanProgramAD', 'classical'),
    GoogleCN: acl('GoogleCN', 'classical'),
    Bing: acl('Bing', 'classical'),
    OneDrive: acl('OneDrive', 'classical'),
    Microsoft: acl('Microsoft', 'classical'),
    Apple: acl('Apple', 'classical'),
    Telegram: acl('Telegram', 'classical'),
    ChinaMedia: acl('ChinaMedia', 'classical'),
    ProxyMedia: acl('ProxyMedia', 'classical'),
    ProxyGFWlist: acl('ProxyGFWlist', 'classical'),
    ChinaDomain: acl('ChinaDomain', 'classical'),
    ChinaCompanyIp: acl('ChinaCompanyIp', 'classical'),
    Download: acl('Download', 'classical'),

    // ACL4SSR（Clash/Ruleset/ 子目录）
    GoogleFCM: acl('GoogleFCM', 'classical', 'Ruleset/'),
    SteamCN: acl('SteamCN', 'classical', 'Ruleset/'),
    NetEaseMusic: acl('NetEaseMusic', 'classical', 'Ruleset/'),
    Epic: acl('Epic', 'classical', 'Ruleset/'),
    Origin: acl('Origin', 'classical', 'Ruleset/'),
    Sony: acl('Sony', 'classical', 'Ruleset/'),
    Steam: acl('Steam', 'classical', 'Ruleset/'),
    Nintendo: acl('Nintendo', 'classical', 'Ruleset/'),
    YouTube: acl('YouTube', 'classical', 'Ruleset/'),
    Netflix: acl('Netflix', 'classical', 'Ruleset/'),
    Bahamut: acl('Bahamut', 'classical', 'Ruleset/'),
    BilibiliHMT: acl('BilibiliHMT', 'classical', 'Ruleset/'),
    Bilibili: acl('Bilibili', 'classical', 'Ruleset/'),

    // 自定义 / 其他来源
    CustomDirect: makeProvider(
        'https://raw.githubusercontent.com/Lbiebest/clash-config/refs/heads/master/rules/CustomDirect.list',
        'classical',
        './ruleset/CustomDirect.yaml'
    ),
    GuoNeiWangZhan: makeProvider(
        'https://raw.githubusercontent.com/Meilieage/webcdn/main/rule/list/GuoNeiWangZhan.list',
        'classical',
        './ruleset/GuoNeiWangZhan.yaml'
    ),
    ChinaIPs: makeProvider(
        'https://raw.githubusercontent.com/DivineEngine/Profiles/master/Clash/RuleSet/Extra/ChinaIP.yaml',
        'ipcidr',
        './ruleset/ChinaIPs.yaml'
    ),
    ProcessRules: makeProvider(
        'https://raw.githubusercontent.com/Lbiebest/clash-config/refs/heads/master/rules/ProcessRules.list',
        'classical',
        './ruleset/ProcessRules.yaml',
        'text'
    )
};

// 自建节点由 Mihomo 本地 provider 管理，节点内容见 providers/custom-proxies.yaml。
const CUSTOM_PROVIDER = 'custom-proxies';
const customProxyProvider = {
    type: 'file',
    path: './providers/custom-proxies.yaml'
};

// 地区组元数据（顺序即最终展示顺序）
const REGION_META = [
    { key: 'hk', name: '🇭🇰 香港节点', tolerance: 50 },
    { key: 'tw', name: '🇨🇳 台湾节点', tolerance: 50 },
    { key: 'jp', name: '🇯🇵 日本节点', tolerance: 50 },
    { key: 'us', name: '🇺🇲 美国节点', tolerance: 150 },
    { key: 'sg', name: '🇸🇬 狮城节点', tolerance: 50 },
    { key: 'kr', name: '🇰🇷 韩国节点', tolerance: 50 },
    { key: 'uk', name: '🇬🇧 英国节点', tolerance: 50 },
    { key: 'nl', name: '🇳🇱 荷兰节点', tolerance: 50 },
    { key: 'ru', name: '🇷🇺 俄罗斯节点', tolerance: 50 },
    { key: 'de', name: '🇩🇪 德国节点', tolerance: 50 },
    { key: 'ch', name: '🇨🇭 瑞士节点', tolerance: 50 },
    { key: 'fr', name: '🇫🇷 法国节点', tolerance: 50 },
    { key: 'se', name: '🇸🇪 瑞典节点', tolerance: 50 },
    { key: 'bg', name: '🇧🇬 保加利亚节点', tolerance: 50 },
    { key: 'at', name: '🇦🇹 奥地利节点', tolerance: 50 },
    { key: 'ie', name: '🇮🇪 爱尔兰节点', tolerance: 50 },
    { key: 'tr', name: '🇹🇷 土耳其节点', tolerance: 50 },
    { key: 'hu', name: '🇭🇺 匈牙利节点', tolerance: 50 },
    { key: 'ca', name: '🇨🇦 加拿大节点', tolerance: 50 },
    { key: 'au', name: '🇦🇺 澳大利亚节点', tolerance: 50 },
    { key: 'ae', name: '🇦🇪 阿联酋节点', tolerance: 50 },
    { key: 'in', name: '🇮🇳 印度节点', tolerance: 50 },
    { key: 'id', name: '🇮🇩 印尼节点', tolerance: 50 },
    { key: 'br', name: '🇧🇷 巴西节点', tolerance: 50 },
    { key: 'ar', name: '🇦🇷 阿根廷节点', tolerance: 50 },
    { key: 'cl', name: '🇨🇱 智利节点', tolerance: 50 }
];

// 是否启用自动测速探测。
//   false —— 所有组改为手动选择(select)，完全不发探测请求，CPU 不再因测速波动
//   true  —— 使用 url-test 自动选最快节点(带 lazy，仅探测正在使用的组)
const AUTO_TEST = false;

// url-test 组通用字段
// lazy: true —— 仅在该组被实际使用时才做健康检查，避免所有组在后台并发探测导致 CPU 飙高
const URL_TEST = { url: 'http://www.gstatic.com/generate_204', interval: 300, lazy: true };

// 根据 AUTO_TEST 生成"测速/选择"类组：开启时为 url-test，关闭时退化为 select
function speedGroup(name, proxies, tolerance) {
    if (AUTO_TEST) {
        return { name, type: 'url-test', proxies, ...URL_TEST, tolerance };
    }
    return { name, type: 'select', proxies };
}

// ------------------------------------------------------------
// DNS 配置
// 目标：消除 DNS 解析风暴导致的 CPU 尖峰
//   1. fake-ip 模式 —— 代理域名不做真实解析，直接返回虚拟 IP，避免每个新域名都发 DNS 查询
//   2. 精简 nameserver —— 国内仅保留 2 个高可用 DNS，减少并发查询
//   3. nameserver-policy 分流 —— 国内域名走国内 DNS，国外域名走国外 DNS
//   4. fake-ip-filter —— 局域网/STUN/测速/时间同步等域名走真实 IP，避免误伤
//
// 重要：国外 fallback 用明文 UDP DNS（8.8.8.8 / 1.1.1.1）而非 DoH。
//   DoH(https://1.1.1.1/dns-query) 在国内直连会被墙握手失败，导致国外域名全部解析失败、无法翻墙。
//   明文 DNS 在 fake-ip 模式下由内核经代理隧道转发，不受此影响。
// ------------------------------------------------------------
// DNS 覆写总开关。TUN 下优先使用精简 fake-ip DNS，避免小程序加载时真实 DNS 风暴。
const DNS_OVERRIDE = MACHINE_CONFIG.dnsOverride;

// TUN + 小程序短连接场景下，sniffer 会放大 CPU 峰值；DNS hijack 足够支撑常规域名规则。
const SNIFFER_OVERRIDE = true;

// ------------------------------------------------------------
// Apple Music DNS 修复
// 背景：redir-host 下 mihomo 会把 Apple 的 CNAME 链原样返回
//   (amp-api.music.apple.com → *.akadns.net → *.fastly.net)。
//   macOS 的 mDNSResponder 会把中间 akadns 名字一起缓存；中间名 TTL 到期后
//   它会直接去查这个中间名，而 akadns 对所有公共 DNS 都返回 SERVFAIL
//   (223.5.5.5 / 119.29.29.29 / 8.8.8.8 / 1.1.1.1 都试过)，
//   于是 amp-api.music.apple.com / is*-ssl.mzstatic.com 解析失败，
//   Music 报「完成请求时出现临时问题」。
// 修复：改用 fake-ip，系统只拿到 198.18.x.x，没有 CNAME 链可跟。
// 回退：把 APPLE_DNS_FIX 改成 false 即可。
// ------------------------------------------------------------
const APPLE_DNS_FIX = MACHINE_CONFIG.appleDnsFix;
const FAKE_IP_TTL = 60;

// 外部控制器（RESTful API）开关。开启后可用 http://127.0.0.1:9090 查询/调试节点
// 排查完建议关掉（避免本地端口长期暴露控制接口）
const EXTERNAL_CONTROLLER = true;
const CONTROLLER_ADDR = '127.0.0.1:9090';
const CONTROLLER_SECRET = ''; // 留空表示本地无密钥访问

// ------------------------------------------------------------
// Tailscale MagicDNS 定向分流
// 背景：关闭 accept-dns 后（避免 MagicDNS 劫持系统 DNS 导致 TUN 下解析被污染），
//   系统不再认识 tailnet 短名。这里让内核把 *.kk.example.com 单独交给
//   Tailscale 的本地 DNS（100.100.100.100，走 utun4 直连），其余域名不受影响。
// 注意：100.100.100.100 属于 100.64.0.0/10，已被规则集判定为 DIRECT，
//   且系统路由 100.100.100.100/32 指向 utun4，不会回环进 TUN。
// ------------------------------------------------------------
const TAILNET_DOMAIN = 'kk.example.com';
const TAILNET_DNS = '100.100.100.100';
const TAILNET_DNS_ENABLED = MACHINE_CONFIG.tailnetDns;

// ------------------------------------------------------------
// Cloudflare Tunnel 直连
// home-macmini 上跑着 cloudflared，边缘地址是 198.41.192.0/24 和
// 198.41.200.0/24。脚本里有 DOMAIN-KEYWORD,cloudflare 走代理的规则，
// 机场节点一挂隧道就整体掉线，所以这台机器上把 CF 边缘和
// argotunnel/cftunnel 强制直连，隧道不再依赖代理。
// ------------------------------------------------------------
const CF_TUNNEL_DIRECT = MACHINE_CONFIG.cfTunnelDirect;

// 国外 DNS 用 Google + Quad9 的 DoH(IP 直连免 bootstrap):
// 不用 Cloudflare 1.1.1.1 —— 其递归解析出口固定在日本 POP,who.1ms.dog 会报"解析器在日本,IP 在新加坡"
const FOREIGN_DNS = ['https://8.8.8.8/dns-query', 'https://9.9.9.9/dns-query'];
const CN_DNS = ['223.5.5.5', '119.29.29.29'];

const dnsConfig = {
    enable: true,
    ipv6: false,
    'enhanced-mode': 'fake-ip',
    'fake-ip-range': '198.18.0.1/16',
    'fake-ip-filter-mode': 'blacklist',
    'cache-algorithm': 'arc',
    'respect-rules': true,
    'fallback-lazy-query': true,
    'fake-ip-filter': [
        '*.lan',
        '*.local',
        '*.localhost',
        '+.msftconnecttest.com',
        '+.msftncsi.com',
        'localhost.ptlogin2.qq.com',
        'dns.msftncsi.com',
        '+.srv.nintendo.net',
        '+.stun.playstation.net',
        '+.xboxlive.com',
        '+.pool.ntp.org',
        'time.*.com',
        'time.*.apple.com',
        'ntp.*.com',
        '+.market.xiaomi.com',
        'stun.*.*',
        'stun.*.*.*',
        '+.qq.com',
        '+.wechat.com'
    ],
    // 默认 DNS：bootstrap，仅用纯 IP，解析 nameserver 里的域名形式服务器
    'default-nameserver': CN_DNS,
    // 主 nameserver：国内 DNS，精简到 2 个
    nameserver: CN_DNS,
    // respect-rules 开启时，mihomo 要求代理服务器域名解析器不能为空
    'proxy-server-nameserver': CN_DNS,
    // 国外域名走国外明文 DNS（经代理隧道转发，防污染且不被握手拦截）
    fallback: FOREIGN_DNS,
    // 分流策略：国内域名直接命中国内 DNS，国外域名命中国外 DNS
    // EDNS 回显类探针(edns.ip-api.com / controld)不在 geosite 名单里,若走国内 nameserver,
    // 权威会看到阿里/腾讯递归出口,who.1ms.dog 报"解析器在中国,IP 在新加坡",故显式指到国外 DNS
    'nameserver-policy': {
        'geosite:cn,private': CN_DNS,
        'geosite:geolocation-!cn': FOREIGN_DNS,
        '+.ip-api.com': FOREIGN_DNS,
        '+.controld.com': FOREIGN_DNS,
        '+.1ms.dog': FOREIGN_DNS
    },
    // fallback 触发条件：国外 DNS 返回国内 IP 时判定为污染，改用 fallback 结果
    'fallback-filter': {
        geoip: true,
        'geoip-code': 'CN',
        ipcidr: ['240.0.0.0/4']
    }
};

const snifferConfig = {
    enable: false,
    'force-dns-mapping': false,
    'parse-pure-ip': false,
    'override-destination': false,
    // 即使以后打开 sniffer，也不要嗅探隧道域名，否则目标会被改写成
    // 域名后重新解析，argotunnel.com 本身没有 A 记录，会直接失败。
    ...(CF_TUNNEL_DIRECT
        ? { 'skip-domain': ['argotunnel.com', 'cftunnel.com'] }
        : {})
};

// 获取符合正则的节点名（附带排除过滤）
function pickByRegex(proxies, regex) {
    return proxies
        .filter(p => regex.test(p.name) && excludeRegex.test(p.name))
        .map(p => p.name);
}

function main(config) {
    // 1. 注册自建节点 provider
    config.proxies = config.proxies || [];
    config['proxy-providers'] = {
        ...(config['proxy-providers'] || {}),
        [CUSTOM_PROVIDER]: customProxyProvider
    };
    config.mode = 'rule';
    config['log-level'] = 'error';
    config['find-process-mode'] = 'strict';
    config['tcp-concurrent'] = true;
    config['unified-delay'] = true;
    config.ipv6 = false;

    const allProxies = config.proxies.map(p => p.name);
    // 参与自动测速的节点：剔除下载/测试/官网等垃圾条目，避免每轮探测都卡超时空耗 CPU
    const testableProxies = config.proxies.filter(p => excludeRegex.test(p.name)).map(p => p.name);
    const nfProxies = pickByRegex(config.proxies, nfRegex);
    const neteaseMusicProxies = pickByRegex(config.proxies, neteaseMusicRegex);

    // 2. 计算各地区节点，构造 url-test 地区组
    const regionProxies = {};
    const regionGroups = [];
    for (const { key, name, tolerance } of REGION_META) {
        const list = pickByRegex(config.proxies, REGION_REGEX[key]);
        regionProxies[key] = list;
        if (list.length > 0) {
            regionGroups.push(speedGroup(name, list, tolerance));
        }
    }
    const regionGroupNames = regionGroups.map(g => g.name);

    // 订阅节点可能自带 dialer-proxy。地区组按实际节点动态生成，
    // 因此在某地区没有可用节点时，移除指向不存在组的引用，避免内核拒绝整份配置。
    const validDialerTargets = new Set([
        ...allProxies,
        ...regionGroupNames,
        'DIRECT',
        'REJECT'
    ]);
    for (const proxy of config.proxies) {
        const dialerProxy = proxy['dialer-proxy'];
        if (dialerProxy && !validDialerTargets.has(dialerProxy)) {
            delete proxy['dialer-proxy'];
        }
    }

    // 存在节点的地区组名（用于常见分流组的候选补全）
    const availableRegionNames = REGION_META.filter(m => regionProxies[m.key].length > 0).map(m => m.name);

    // 在基础候选后追加所有可用地区组
    const withRegions = (...base) => [...base, ...availableRegionNames];

    // 仅在对应地区有节点时才追加该地区组
    const ifRegion = key => (regionProxies[key].length > 0 ? [REGION_META.find(m => m.key === key).name] : []);

    // 3. 代理组
    config['proxy-groups'] = [
        { name: '🎯 自定义直连', type: 'select', proxies: ['DIRECT'] },
        {
            name: '🚀 节点选择',
            type: 'select',
            proxies: ['♻️ 自动选择', ...regionGroupNames, '🚀 手动切换', 'DIRECT', '自定义代理']
        },
        { name: '🚀 手动切换', type: 'select', proxies: allProxies, use: [CUSTOM_PROVIDER] },
        speedGroup('♻️ 自动选择', testableProxies, 50),
        {
            name: '📲 电报消息',
            type: 'select',
            proxies: withRegions('🚀 节点选择', '♻️ 自动选择', '🚀 手动切换', 'DIRECT')
        },
        { name: '🤖 AI', type: 'select', proxies: withRegions('🚀 节点选择', '♻️ 自动选择', '🚀 手动切换', 'DIRECT', '自定义代理') },
        { name: '📹 油管视频', type: 'select', proxies: withRegions('🚀 节点选择', '自定义代理') },
        { name: '🎥 奈飞视频', type: 'select', proxies: withRegions('🎥 奈飞节点', '自定义代理') },
        {
            name: '📺 巴哈姆特',
            type: 'select',
            proxies: [...ifRegion('tw'), '🚀 节点选择', '🚀 手动切换', 'DIRECT']
        },
        {
            name: '📺 哔哩哔哩',
            type: 'select',
            proxies: ['🎯 全球直连', ...ifRegion('hk'), ...ifRegion('tw')]
        },
        {
            name: '🌍 国外媒体',
            type: 'select',
            proxies: withRegions('🚀 节点选择', '♻️ 自动选择', '🚀 手动切换', 'DIRECT')
        },
        {
            name: '🌏 国内媒体',
            type: 'select',
            proxies: ['DIRECT', '🚀 手动切换', ...ifRegion('sg'), ...ifRegion('hk'), ...ifRegion('tw'), ...ifRegion('jp')]
        },
        { name: '📢 谷歌FCM', type: 'select', proxies: withRegions('DIRECT', '🚀 节点选择', '🚀 手动切换') },
        { name: 'Ⓜ️ 微软Bing', type: 'select', proxies: withRegions('DIRECT', '🚀 节点选择', '🚀 手动切换') },
        { name: 'Ⓜ️ 微软云盘', type: 'select', proxies: withRegions('DIRECT', '🚀 节点选择', '🚀 手动切换') },
        { name: 'Ⓜ️ 微软服务', type: 'select', proxies: withRegions('DIRECT', '🚀 节点选择', '🚀 手动切换') },
        { name: '🍎 苹果服务', type: 'select', proxies: withRegions('DIRECT', '🚀 节点选择', '🚀 手动切换') },
        { name: '🎮 游戏平台', type: 'select', proxies: withRegions('🚀 节点选择', '🚀 手动切换', 'DIRECT') },
        {
            name: '🎶 网易音乐',
            type: 'select',
            proxies: ['DIRECT', '🚀 节点选择', '♻️ 自动选择', ...neteaseMusicProxies]
        },
        { name: '🎯 全球直连', type: 'select', proxies: ['DIRECT', '🚀 节点选择', '♻️ 自动选择'] },
        {
            name: '🖥️ 远程直连',
            type: 'select',
            proxies: withRegions('DIRECT', '🚀 节点选择', '♻️ 自动选择', '🚀 手动切换', '自定义代理')
        },
        { name: '🛑 广告拦截', type: 'select', proxies: ['REJECT', 'DIRECT'] },
        { name: '🍃 应用净化', type: 'select', proxies: ['REJECT', 'DIRECT'] },
        {
            name: '🐟 漏网之鱼',
            type: 'select',
            proxies: withRegions('♻️ 自动选择', '🚀 节点选择', '🚀 手动切换', 'DIRECT')
        },
        { name: '🎥 奈飞节点', type: 'select', proxies: nfProxies.length > 0 ? nfProxies : ['DIRECT'] },
        // Bettbox 会优先使用代理组的 url 做节点测速；家宽出口对 Apple 探测地址不稳定，使用通用 204 地址避免误报 Timeout。
        { name: '自定义代理', type: 'select', url: URL_TEST.url, use: [CUSTOM_PROVIDER] },
        ...regionGroups
    ];

    config['rule-providers'] = ruleProviders;
    config['rules'] = buildRules();
    if (DNS_OVERRIDE) {
        config.dns = dnsConfig;
    }
    // 先定 fake-ip 模式，applyTailnetDnsPolicy 才能把 tailnet 域名补进 fake-ip-filter
    applyAppleDnsFix(config);
    if (TAILNET_DNS_ENABLED) {
        applyTailnetDnsPolicy(config);
    }
    if (SNIFFER_OVERRIDE) {
        config.sniffer = snifferConfig;
    }
    if (EXTERNAL_CONTROLLER) {
        config['external-controller'] = CONTROLLER_ADDR;
        config.secret = CONTROLLER_SECRET;
    }
    return config;
}

// ------------------------------------------------------------
// Tailscale MagicDNS 定向分流
// 在订阅自带 DNS 的基础上打补丁：只把 tailnet 域名指向 100.100.100.100，
// 其余解析逻辑（DoH 上游、redir-host/fake-ip 模式）保持订阅原样。
// ------------------------------------------------------------
function applyTailnetDnsPolicy(config) {
    const dns = config.dns || (config.dns = {});
    const policyKey = `+.${TAILNET_DOMAIN}`;

    // 1. 定向解析策略：tailnet 域名交给 Tailscale 本地 DNS
    dns['nameserver-policy'] = {
        ...(dns['nameserver-policy'] || {}),
        [policyKey]: TAILNET_DNS,
        [TAILNET_DOMAIN]: TAILNET_DNS
    };

    // 2. fake-ip 模式下必须把 tailnet 域名排除，否则拿到 198.18.x.x 虚拟 IP，
    //    Tailscale 的接口地址解析会失败。
    if (dns['enhanced-mode'] === 'fake-ip') {
        const filter = dns['fake-ip-filter'] || (dns['fake-ip-filter'] = []);
        for (const entry of [policyKey, `*.${TAILNET_DOMAIN}`, TAILNET_DOMAIN]) {
            if (!filter.includes(entry)) filter.push(entry);
        }
    }

    // 3. respect-rules 开启时，内核会用 proxy-server-nameserver 解析代理服务器域名。
    //    tailnet 内可能有代理服务器，补进去避免解析失败。
    if (dns['respect-rules']) {
        const psn = dns['proxy-server-nameserver'] || (dns['proxy-server-nameserver'] = []);
        if (Array.isArray(psn) && !psn.includes(TAILNET_DNS)) psn.push(TAILNET_DNS);
    }
}

// ------------------------------------------------------------
// Apple Music DNS 修复：切到 fake-ip，避免 macOS 跟踪 CNAME 链。
// 只改解析模式，nameserver / 订阅自带的其他 DNS 设置保持原样。
// ------------------------------------------------------------
function applyAppleDnsFix(config) {
    if (!APPLE_DNS_FIX) return;
    const dns = config.dns || (config.dns = {});

    dns['enhanced-mode'] = 'fake-ip';
    dns['fake-ip-range'] = dns['fake-ip-range'] || '198.18.0.1/16';
    dns['fake-ip-filter-mode'] = dns['fake-ip-filter-mode'] || 'blacklist';
    // 默认 1 秒会让系统每秒重查一次，这里放宽到 60 秒。
    dns['fake-ip-ttl'] = FAKE_IP_TTL;

    // fake-ip 下这些域名必须拿真实 IP（时间同步/连通性探测/局域网等），
    // 订阅里已有的过滤表保留，只补几条常见的。
    const filter = dns['fake-ip-filter'] || (dns['fake-ip-filter'] = []);
    for (const entry of [
        '*.lan', '*.local', '*.localhost', '*.home.arpa',
        '+.msftconnecttest.com', '+.msftncsi.com', 'dns.msftncsi.com',
        'time.*.com', 'time.*.apple.com', '+.pool.ntp.org',
        'stun.*.*', 'stun.*.*.*'
    ]) {
        if (!filter.includes(entry)) filter.push(entry);
    }
}

// ------------------------------------------------------------
// 规则列表（顺序敏感，从上到下匹配）
// ------------------------------------------------------------
function buildRules() {
    const rules = [
        // ===== Claude/Anthropic 固定出口 =====
        // claude.ai 检测到的 IP 必须稳定为 sgw-oracle-01(149.118.50.173),
        // 固定走「自定义代理」组(SGW自建-经港前置),不随 🤖 AI / 节点选择 的手动切换漂移
        'DOMAIN-SUFFIX,anthropic.com,自定义代理',
        'DOMAIN-SUFFIX,claude.ai,自定义代理',
        'DOMAIN-SUFFIX,claude.com,自定义代理',
        'DOMAIN-SUFFIX,anthropic.dev,自定义代理',
        'DOMAIN-SUFFIX,claudeusercontent.com,自定义代理',

        // ===== 自定义直连 / 指定分流 =====
        // 微信小程序高频域名放最前面，避免 TUN 下反复扫大规则集
        'PROCESS-NAME,Weixin.exe,🎯 全球直连',

'PROCESS-NAME,GameViewer.exe,🎯 全球直连',
						
        'PROCESS-NAME,WeChat.exe,🎯 全球直连',
        'PROCESS-NAME,WeChatAppEx.exe,🎯 全球直连',
        'DOMAIN,mp.weixin.qq.com,🎯 全球直连',
        'DOMAIN,res.wx.qq.com,🎯 全球直连',
        'DOMAIN,long.open.weixin.qq.com,🎯 全球直连',
        'DOMAIN,apd-pcdnwxlogin.teg.tencent-cloud.net,🎯 全球直连',
        'DOMAIN-SUFFIX,weixin.qq.com,🎯 全球直连',
        'DOMAIN-SUFFIX,wechat.com,🎯 全球直连',
        'DOMAIN-SUFFIX,weixin.com,🎯 全球直连',
        'DOMAIN-SUFFIX,servicewechat.com,🎯 全球直连',
        'DOMAIN-SUFFIX,tenpay.com,🎯 全球直连',
        'DOMAIN-SUFFIX,qq.com,🎯 全球直连',
        'DOMAIN-SUFFIX,qpic.cn,🎯 全球直连',
        'DOMAIN-SUFFIX,qlogo.cn,🎯 全球直连',
        'DOMAIN-SUFFIX,gtimg.com,🎯 全球直连',
        'DOMAIN-SUFFIX,gtimg.cn,🎯 全球直连',
        'DOMAIN-SUFFIX,idqqimg.com,🎯 全球直连',
        'DOMAIN-SUFFIX,wechatpay.com,🎯 全球直连',
        'DOMAIN-SUFFIX,wechatos.net,🎯 全球直连',
        'DOMAIN-SUFFIX,wxapp.tc.qq.com,🎯 全球直连',
        'DOMAIN-SUFFIX,wxs.qq.com,🎯 全球直连',
        'DOMAIN-SUFFIX,wx.qq.com,🎯 全球直连',
        'DOMAIN-SUFFIX,wx.gtimg.com,🎯 全球直连',
        'DOMAIN-SUFFIX,vweixinthumb.tc.qq.com,🎯 全球直连',
        'DOMAIN-SUFFIX,lbs.gtimg.com,🎯 全球直连',
        'DOMAIN-SUFFIX,map.qq.com,🎯 全球直连',
        'DOMAIN-SUFFIX,qcloud.com,🎯 全球直连',
        'DOMAIN-SUFFIX,myqcloud.com,🎯 全球直连',
        'DOMAIN-SUFFIX,tencent-cloud.net,🎯 全球直连',
        'DOMAIN-SUFFIX,tencent.com,🎯 全球直连',
        'DOMAIN-SUFFIX,tencent.com.cn,🎯 全球直连',
        'DOMAIN-KEYWORD,weixin,🎯 全球直连',

        // 海外 AI 统一走 VPSDance 综合规则集（放前面保证优先命中通用 Google/GFW 规则）
        'RULE-SET,AIProxy,🤖 AI',
        'DOMAIN-SUFFIX,deepmind.com,🚀 节点选择',
        'DOMAIN-KEYWORD,colab,🚀 节点选择',
        'DOMAIN-KEYWORD,developerprofiles,🚀 节点选择',
        'DOMAIN-KEYWORD,github,🚀 节点选择',
        'DOMAIN,zhuce.mri.edu.kg,🚀 节点选择',
        'DOMAIN-KEYWORD,imgur,🇺🇲 美国节点',
        'DOMAIN-KEYWORD,infini,🎯 全球直连',
        'DOMAIN-KEYWORD,cnki,🎯 全球直连',
        'DOMAIN-KEYWORD,qcc,🎯 全球直连',
        'DOMAIN-KEYWORD,gitcode,🎯 全球直连',
        'DOMAIN-SUFFIX,linux.do,🚀 节点选择',
        'DOMAIN-SUFFIX,speedtest.net,🎯 全球直连',
        'DOMAIN-SUFFIX,nguaduot.cn,🎯 全球直连',
        // ===== 远程软件统一分组（进程识别，Windows .exe / macOS 进程名） =====
        // 网易 UU远程（macOS 进程 + Windows .exe）
        'PROCESS-NAME,UURemote,🖥️ 远程直连',
        'PROCESS-NAME,UURemoteDaemon,🖥️ 远程直连',
        'PROCESS-NAME,UURemoteServer,🖥️ 远程直连',
        'PROCESS-NAME,UURemoteService,🖥️ 远程直连',
        'PROCESS-NAME,UURemote.exe,🖥️ 远程直连',
        'PROCESS-NAME,UURemote_Service.exe,🖥️ 远程直连',
        'PROCESS-NAME,UU Remote,🖥️ 远程直连',
        'DOMAIN-KEYWORD,uuyc,🖥️ 远程直连',
        // 向日葵 / AweSun（国际版，本机已装）
        'PROCESS-NAME,AweSun,🖥️ 远程直连',
        'PROCESS-NAME,AweSun_Desktop,🖥️ 远程直连',
        'PROCESS-NAME,AweSun_Helper,🖥️ 远程直连',
        'PROCESS-NAME,AweSun.exe,🖥️ 远程直连',
        'PROCESS-NAME,SunloginClient.exe,🖥️ 远程直连',
        'PROCESS-NAME,SunloginClient,🖥️ 远程直连',
        // ToDesk（macOS 进程 + Windows .exe）
        'PROCESS-NAME,ToDesk,🖥️ 远程直连',
        'PROCESS-NAME,ToDesk_Service,🖥️ 远程直连',
        'PROCESS-NAME,ToDesk_Session_Proxy,🖥️ 远程直连',
        'PROCESS-NAME,ToDesk.exe,🖥️ 远程直连',
        'PROCESS-NAME,ToDesk_Service.exe,🖥️ 远程直连',
        // AnyDesk
        'PROCESS-NAME,AnyDesk.exe,🖥️ 远程直连',
        'PROCESS-NAME,AnyDesk,🖥️ 远程直连',
        // TeamViewer
        'PROCESS-NAME,TeamViewer.exe,🖥️ 远程直连',
        'PROCESS-NAME,TeamViewer_Service.exe,🖥️ 远程直连',
        'PROCESS-NAME,TeamViewer,🖥️ 远程直连',
        // RustDesk（macOS 进程名大写 + Windows 小写 .exe）
        'PROCESS-NAME,RustDesk,🖥️ 远程直连',
        'PROCESS-NAME,rustdesk.exe,🖥️ 远程直连',
        'PROCESS-NAME,rustdesk,🖥️ 远程直连',
        // Parsec
        'PROCESS-NAME,parsecd.exe,🖥️ 远程直连',
        'PROCESS-NAME,parsecd,🖥️ 远程直连',
        // Splashtop
        'PROCESS-NAME,SRServer.exe,🖥️ 远程直连',
        'PROCESS-NAME,SRService.exe,🖥️ 远程直连',
        'PROCESS-NAME,Splashtop Streamer,🖥️ 远程直连',
        // NoMachine
        'PROCESS-NAME,nxplayer.exe,🖥️ 远程直连',
        'PROCESS-NAME,nxnode.exe,🖥️ 远程直连',
        // Chrome 远程桌面
        'PROCESS-NAME,remoting_host.exe,🖥️ 远程直连',
        // Windows 远程桌面 (RDP)
        'PROCESS-NAME,mstsc.exe,🖥️ 远程直连',
        // VNC (RealVNC / TigerVNC，macOS 进程 vncviewer + Windows .exe)
        'PROCESS-NAME,vncviewer,🖥️ 远程直连',
        'PROCESS-NAME,vncserver.exe,🖥️ 远程直连',
        'PROCESS-NAME,vncviewer.exe,🖥️ 远程直连',
        'PROCESS-NAME,winvnc.exe,🖥️ 远程直连',
        // 微软远程桌面 (macOS)
        'PROCESS-PATH,/Applications/Windows App.app/Contents/MacOS/Windows App,🖥️ 远程直连',
        'PROCESS-PATH,/Applications/Tailscale.app/Contents/MacOS/Tailscale,DIRECT',
        'IP-CIDR,120.24.190.16/32,DIRECT',
        'IP-CIDR,100.64.0.0/10,DIRECT',
        'DOMAIN-KEYWORD,cloudflare,🚀 节点选择',
        'DOMAIN-SUFFIX,bilibili.com,🚀 节点选择',
        'DOMAIN-SUFFIX,wordpress.org,🚀 节点选择',
        'DOMAIN-SUFFIX,cloudflare.com,🚀 节点选择',
        'DOMAIN-SUFFIX,supabase.co,🚀 节点选择',
        'DOMAIN-SUFFIX,supabase.com,🚀 节点选择',
        'DOMAIN-KEYWORD,tailscale,🎯 全球直连',
        // tailnet 内主机名统一直连（配合 applyTailnetDnsPolicy 的定向解析）
        ...(TAILNET_DNS_ENABLED ? [`DOMAIN-SUFFIX,${TAILNET_DOMAIN},DIRECT`] : []),
        'PROCESS-NAME,tailscale.exe,DIRECT',
        'PROCESS-NAME,tailscaled.exe,DIRECT',
        'DOMAIN-KEYWORD,dmxsmart.com,🎯 全球直连',
        'PROCESS-NAME,WinSCP.exe,🎯 全球直连',
        'DOMAIN-SUFFIX,gstatic.com,🚀 节点选择',
        'DOMAIN-SUFFIX,xn--ngstr-lra8j.com,🚀 节点选择',
        'DOMAIN-SUFFIX,github.io,🚀 节点选择',
        'DOMAIN,v2rayse.com,🚀 节点选择',

        // ===== Loyalsoldier 规则集 =====
        'RULE-SET,private,🎯 全球直连',
        'RULE-SET,reject,🛑 广告拦截',
        'RULE-SET,icloud,Ⓜ️ 微软服务',
        'RULE-SET,apple,🍎 苹果服务',
        'RULE-SET,google,📢 谷歌FCM',
        'RULE-SET,proxy,🚀 节点选择',
        'RULE-SET,gfw,🚀 节点选择',
        'RULE-SET,tld-not-cn,🚀 节点选择',
        'RULE-SET,direct,🎯 全球直连',
        'RULE-SET,lancidr,🎯 全球直连,no-resolve',
        'RULE-SET,cncidr,🎯 全球直连,no-resolve',
        'RULE-SET,telegramcidr,📲 电报消息,no-resolve',

        // 进程规则
        'RULE-SET,ProcessRules,DIRECT',

        // ===== 国内 IP =====
        'GEOIP,CN,🎯 全球直连',
        'RULE-SET,ChinaIPs,🎯 全球直连',

        // ===== 自定义规则集 =====
        'RULE-SET,CustomDirect,🎯 自定义直连',
        'RULE-SET,GuoNeiWangZhan,🎯 全球直连',

        // ===== 基础规则 =====
        'RULE-SET,LocalAreaNetwork,🎯 全球直连',
        'RULE-SET,UnBan,🎯 全球直连',

        // ===== 广告 =====
        'RULE-SET,BanAD,🛑 广告拦截',
        'RULE-SET,BanProgramAD,🍃 应用净化',

        // ===== 国际服务 =====
        'RULE-SET,GoogleFCM,📢 谷歌FCM',
        'RULE-SET,GoogleCN,🎯 全球直连',
        'RULE-SET,SteamCN,🎯 全球直连',
        'RULE-SET,Bing,Ⓜ️ 微软Bing',
        'RULE-SET,OneDrive,Ⓜ️ 微软云盘',
        'RULE-SET,Microsoft,Ⓜ️ 微软服务',
        'RULE-SET,Apple,🍎 苹果服务',
        'RULE-SET,Telegram,📲 电报消息',

        // ===== 国内服务 =====
        'RULE-SET,NetEaseMusic,🎶 网易音乐',

        // ===== 游戏平台 =====
        'RULE-SET,Epic,🎮 游戏平台',
        'RULE-SET,Origin,🎮 游戏平台',
        'RULE-SET,Sony,🎮 游戏平台',
        'RULE-SET,Steam,🎮 游戏平台',
        'RULE-SET,Nintendo,🎮 游戏平台',

        // ===== 流媒体 =====
        'RULE-SET,YouTube,📹 油管视频',
        'RULE-SET,Netflix,🎥 奈飞视频',
        'RULE-SET,Bahamut,📺 巴哈姆特',
        'RULE-SET,BilibiliHMT,📺 哔哩哔哩',
        'RULE-SET,Bilibili,📺 哔哩哔哩',
        'RULE-SET,ChinaMedia,🌏 国内媒体',
        'RULE-SET,ProxyMedia,🌍 国外媒体',

        // ===== 代理列表 =====
        'RULE-SET,ProxyGFWlist,🚀 节点选择',

        // ===== 中国直连域名 =====
        'RULE-SET,ChinaDomain,🎯 全球直连',
        'RULE-SET,ChinaCompanyIp,🎯 全球直连',
        'RULE-SET,Download,🎯 全球直连',

        // ===== 私有网段 =====
        'IP-CIDR,10.0.0.0/8,DIRECT',
        'IP-CIDR,100.64.0.0/10,DIRECT,no-resolve',
        'IP-CIDR,172.16.0.0/12,DIRECT',
        'IP-CIDR,192.168.0.0/16,DIRECT',
        'IP-CIDR,169.254.0.0/16,DIRECT',
        'IP-CIDR,100.64.0.0/10,DIRECT',
        'IP-CIDR,127.0.0.0/8,DIRECT',

        // ===== 兜底 =====
        'MATCH,🐟 漏网之鱼'
    ];

    // Cloudflare Tunnel 边缘直连：必须排在 DOMAIN-KEYWORD,cloudflare 之前
    if (CF_TUNNEL_DIRECT) {
        rules.unshift(
            'IP-CIDR,198.41.192.0/24,DIRECT,no-resolve',
            'IP-CIDR,198.41.200.0/24,DIRECT,no-resolve',
            'DOMAIN-SUFFIX,argotunnel.com,DIRECT',
            'DOMAIN-SUFFIX,cftunnel.com,DIRECT'
        );
    }

    return rules;
}

// 模块导出（兼容 Node 环境测试；Clash 运行时忽略）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { main };
}

import {writeFileSync} from 'node:fs';
import {YAZAKI_PAGES} from '/home/user/-/src/sasaoka/yazakiCatalogData.ts';
import {TOTO_PAGES} from '/home/user/-/src/sasaoka/totoCatalogData.ts';
import {MATSU6_PAGES} from '/home/user/-/src/sasaoka/matsu6CatalogData.ts';
writeFileSync(process.argv[2], JSON.stringify({yazaki: YAZAKI_PAGES, toto: TOTO_PAGES, matsu6: MATSU6_PAGES}));
for (const [k, v] of Object.entries({yazaki: YAZAKI_PAGES, toto: TOTO_PAGES, matsu6: MATSU6_PAGES})) console.log(k, 'pages', v.length, 'codes', v.reduce((a, p) => a + p.codes.length, 0));

import { Route } from '@/types';
import ofetch from '@/utils/ofetch';
import { parseDate } from '@/utils/parse-date';
import { load } from 'cheerio';
import vm from 'node:vm';
import cache from '@/utils/cache';

interface Package {
    name: string;
    version: string;
    entrypoint: string;
    authors: Array<string>;
    license: string;
    description: string;
    repository: string;
    keywords: Array<string>;
    compiler: string;
    exclude: Array<string>;
    size: number;
    readme: string;
    updatedAt: number;
    releasedAt: number;
}

interface Context {
    an: { exports: Array<Package> };
}

export const route: Route = {
    path: '/universe',
    categories: ['program-update'],
    example: '/typst/universe',
    radar: [
        {
            source: ['typst.app/universe'],
            target: '/universe',
        },
    ],
    name: 'Universe',
    maintainers: ['HPDell'],
    handler: async () => {
        const targetUrl = 'https://typst.app/universe/search?kind=packages%2Ctemplates&packages=last-updated&q=';
        const page = await ofetch(targetUrl);
        const $ = load(page);
        const script = $('script')
            .toArray()
            .map((item) => item.attribs.src)
            .find((item) => item && item.startsWith('/scripts/universe-search'));
        const data: string = await ofetch(`https://typst.app${script}`, {
            parseResponse: (txt) => txt,
        });
        let packages = data.match(/(an.exports=[\S\s]+);var ([$A-Z_a-z][\w$]*)=new Intl.Collator/)?.[1];
        if (packages) {
            packages = packages.slice(0, -2);
            const context: Context = { an: { exports: [] } };
            vm.createContext(context);
            vm.runInContext(packages, context, {
                displayErrors: true,
            });
            const items = context.an.exports.sort((a, b) => a.updatedAt - b.updatedAt);
            const groups = new Map(items.map((it) => [it.name, it]));
            const pkgs = [...groups.values()].map(async (item) => await cache.tryGet(`typst:universe:${item.name}:${item.version}`, async () => {
                    const pkgLink = `https://typst.app/universe/package/${item.name}`;
                    const $ = load(await ofetch(pkgLink));
                    return {
                        title: `${item.name} (${item.version}) | ${item.description}`,
                        link: pkgLink,
                        description: $('section#readme').html(),
                        pubDate: parseDate(item.updatedAt, 'X'),
                    };
                }));
            return {
                title: 'Typst universe',
                link: targetUrl,
                item: await Promise.all(pkgs),
            };
        } else {
            return {
                title: 'Typst universe',
                link: targetUrl,
                item: [],
            };
        }
    },
};

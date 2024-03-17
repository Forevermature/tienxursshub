import { Route } from '@/types';
import got from '@/utils/got';
import { parseDate } from '@/utils/parse-date';

export const route: Route = {
    path: '/news/:language?',
    categories: ['programming'],
    example: '/news/zh-hans',
    parameters: {
        language: 'zh-hans | zh-hant',
    },
    radar: [
        {
            source: ['kaopu.news'],
        },
    ],
    name: '靠谱新闻',
    maintainers: ['fashioncj'],
    handler,
};

async function handler(ctx) {
    const { language } = ctx.req.param();

    const rootUrl = 'https://kaopu.news';
    const currentUrl = `${rootUrl}/${language === 'zh-hant' ? 'zh-hant' : 'index'}.html`;
    // API PATH: https://kaopucdn.azureedge.net/jsondata/news_list_beta_hans_0.json
    const apiUrl = `https://kaopucdn.azureedge.net/jsondata/news_list_beta_han${language === 'zh-hant' ? 't' : 's'}_0.json`;

    const response = await got({
        method: 'get',
        url: apiUrl,
    });

    const items = response.data.map((item) => ({
        link: item.link,
        title: item.title,
        author: item.publisher,
        pubDate: parseDate(item.pubDate),
        description: `<p>${item.description}</p>`,
    }));

    return {
        title: language === 'zh-hant' ? '靠譜新聞' : '靠谱新闻',
        link: currentUrl,
        item: items,
    };
}

import { Route } from '@/types';
import got from '@/utils/got';
import { parseDate } from '@/utils/parse-date';
import { config } from '@/config';
import cache from '@/utils/cache';
import { getToken } from './token';
import getUserNovels from './api/get-user-novels';
import getNovelContent from './api/get-novel-content';

const baseUrl = 'https://www.pixiv.net';
const novelTextRe = /"text":"(.+?[^\\])"/;

export const route: Route = {
    path: '/user/novels/:id/:lang?',
    categories: ['social-media'],
    example: '/pixiv/user/novels/27104704',
    parameters: {
        id: "Novel series id, available in novel series' homepage URL",
        lang: 'IETF BCP 47 language tag that helps RSS readers choose the right font',
    },
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    radar: {
        source: ['www.pixiv.net/users/:id/novels'],
    },
    name: 'User Novels',
    maintainers: ['TonyRL'],
    handler,
};

async function handler(ctx) {
    if (!config.pixiv || !config.pixiv.refreshToken) {
        return handleWeb(ctx);
    }

    const id = ctx.req.param('id');
    const limit = Number.parseInt(ctx.req.query('limit')) || 10;
    const token = await getToken(cache.tryGet);
    if (!token) {
        throw new Error('pixiv not login');
    }

    const userNovelsResponse = await getUserNovels(id, token);
    const username = userNovelsResponse.data.user.name;
    const novels = userNovelsResponse.data.novels.slice(0, limit).map((novel) => {
        let title = novel.title;
        if (novel.series.id) {
            title = `${novel.series.title} - ${novel.title}`;
        }
        return {
            novelId: novel.id,
            title,
            author: username,
            pubDate: parseDate(novel.create_date),
            link: `https://www.pixiv.net/novel/show.php?id=${novel.id}`,
        };
    });

    let langDivLeft = '';
    let langDivRight = '';
    const lang = ctx.req.param('lang');
    if (lang) {
        langDivLeft = `<div lang="${lang}">`;
        langDivRight = '</div>';
    }
    const items = await Promise.all(
        novels.map((novel) =>
            cache.tryGet(novel.link, async () => {
                const content = await getNovelContent(novel.novelId, token);
                const rawText = novelTextRe.exec(content.data)[1];
                novel.description = `${langDivLeft}<p>${unescape(rawText.replaceAll('\\u', '%u'))}</p>${langDivRight}`
                    .replaceAll('\\n', '</p><p>')
                    .replaceAll('\\t', '\t')
                    .replaceAll('\\', '')
                    .replaceAll(/\[\[rb:(.+?) > (.+?)]]/g, '<ruby>$1<rp>(</rp><rt>$2</rt><rp>)</rp></ruby>')
                    .replaceAll(/\[pixivimage:(\d+-\d+)]/g, `<p><img src="${config.pixiv.imgProxy}/$1.jpg"></p>`);
                return novel;
            })
        )
    );

    return {
        title: `${username}'s Novels`,
        link: `https://www.pixiv.net/users/${id}/novels`,
        description: `${username}'s Novels`,
        item: items,
    };
}

async function handleWeb(ctx) {
    const id = ctx.req.param('id');
    const { limit = 100 } = ctx.req.query();
    const url = `${baseUrl}/users/${id}/novels`;
    const { data: allData } = await got(`${baseUrl}/ajax/user/${id}/profile/all`, {
        headers: {
            referer: url,
        },
    });

    const novels = Object.keys(allData.body.novels)
        .sort((a, b) => b - a)
        .slice(0, Number.parseInt(limit, 10));
    const searchParams = new URLSearchParams();
    for (const novel of novels) {
        searchParams.append('ids[]', novel);
    }

    const { data } = await got(`${baseUrl}/ajax/user/${id}/profile/novels`, {
        headers: {
            referer: url,
        },
        searchParams,
    });

    const items = Object.values(data.body.works).map((item) => ({
        title: item.seriesTitle || item.title,
        description: item.description || item.title,
        link: `${baseUrl}/novel/series/${item.id}`,
        author: item.userName,
        pubDate: parseDate(item.createDate),
        updated: parseDate(item.updateDate),
        category: item.tags,
    }));

    return {
        title: data.body.extraData.meta.title,
        description: data.body.extraData.meta.ogp.description,
        image: Object.values(data.body.works)[0].profileImageUrl,
        link: url,
        item: items,
    };
}

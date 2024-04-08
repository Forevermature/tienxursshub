import { Route } from '@/types';
import { config } from '@/config';
import ConfigNotFoundError from '@/errors/types/config-not-found';
import { parseDate } from '@/utils/parse-date';
import timezone from '@/utils/timezone';
import { CookieJar } from 'tough-cookie';
import { load } from 'cheerio';
import { Context } from 'hono';
import cache from '@/utils/cache';
import got from 'got';

const cookieJar = new CookieJar();

const _got = got.extend({
    cookieJar,
    followRedirect: false,
});

export const route: Route = {
    path: '/news/:treeid?',
    categories: ['university'],
    example: '/bupt/news/1154',
    parameters: {
        treeid: '信息门户网址中的 wbtreeid',
    },
    description: '需要有校园网环境',
    features: {
        requireConfig: [
            {
                name: 'BUPT_STUDENT_ID',
                description: '北京邮电大学学号',
            },
            {
                name: 'BUPT_AUTH_PASSWORD',
                description: '北京邮电大学统一认证密码',
            },
        ],
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    radar: [
        {
            source: ['my.bupt.edu.cn/list.jsp'],
        },
    ],
    name: '北京邮电大学校内新闻/通知',
    maintainers: ['YouXam'],
    handler,
    url: 'my.bupt.edu.cn/',
};

async function handler(ctx: Context) {
    const res = await _got('http://my.bupt.edu.cn/list.jsp?urltype=tree.TreeTempUrl&wbtreeid=' + (ctx.req.param('treeid') || '1154'));
    if (res.statusCode === 302) {
        await loginAuth();
        return handler(ctx);
    } else if (res.statusCode !== 200) {
        throw new Error(res.statusCode + (res.statusMessage || ''));
    }
    const $ = load(res.body);
    const items = await Promise.all(
        $('ul.newslist > li')
            .toArray()
            .map((x) => $(x).children().toArray())
            .map(async ([a, author, pubDate]) => ({
                title: a.attribs.title,
                link: 'http://my.bupt.edu.cn/' + a.attribs.href,
                author: $(author).text(),
                pubDate: timezone(parseDate($(pubDate).text(), 'YYYY/MM/DD'), +8),
                description: (await cache.tryGet('http://my.bupt.edu.cn/' + a.attribs.href, async () => {
                    const res = await _got('http://my.bupt.edu.cn/' + a.attribs.href);
                    const $ = load(res.body);
                    return $('div.singleinfo').html() || '获取失败';
                })) as string,
            }))
    );

    const imageUrl = 'https://www.bupt.edu.cn/__local/1/F4/62/05815E603799A29D53DDB1E0FAF_557A7220_102AD.png';
    return {
        title: $('div.breadcrumbs').text().split(/\s+/).filter(Boolean).join('-'),
        link: 'https://www.bupt.edu.cn/',
        item: items,
        image: imageUrl,
        icon: imageUrl,
        logo: imageUrl,
    };
}

async function getExecution() {
    const res = await _got.get('https://auth.bupt.edu.cn/authserver/login?service=http://my.bupt.edu.cn/system/resource/code/auth/clogin.jsp?owner=1664271694');
    const executions = res.body.match(/<input name="execution" value="(.*?)"/);
    if (!executions || !executions.length) {
        throw new Error('Failed to obtain the execution value from the HTML response');
    }
    return executions[1];
}

async function loginAuth() {
    if (!config.bupt.student_id || !config.bupt.auth_password) {
        throw new ConfigNotFoundError('Missing BUPT_STUDENT_ID or BUPT_AUTH_PASSWORD');
    }
    const bodyp = `username=${encodeURIComponent(config.bupt.student_id)}&password=${encodeURIComponent(config.bupt.auth_password)}`;
    const execution = await getExecution();
    const res = await _got.post('https://auth.bupt.edu.cn/authserver/login', {
        headers: {
            authority: 'auth.bupt.edu.cn',
            'content-type': 'application/x-www-form-urlencoded',
            referer: 'https://auth.bupt.edu.cn/authserver/login?service=http%3A%2F%2Fmy.bupt.edu.cn%2Fsystem%2Fresource%2Fcode%2Fauth%2Fclogin.jsp%3Fowner%3D1664271694',
            'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36 Edg/118.0.2088.61',
        },
        body: bodyp + '&submit=%E7%99%BB%E5%BD%95&type=username_password&execution=' + execution + '&_eventId=submit',
    });
    if (res.statusCode === 302) {
        await _got.get(res.headers.location!, {
            followRedirect: true,
        });
        await _got.get('http://my.bupt.edu.cn/index.jsp?null=');
    } else if (res.statusCode !== 200) {
        throw new Error('登录失败，请检查学号和密码（注意必须是统一认证的密码）');
    }
}

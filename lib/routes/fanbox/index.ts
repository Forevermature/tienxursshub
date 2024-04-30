import InvalidParameterError from '@/errors/types/invalid-parameter';
import type { Data, Route } from '@/types';
import got from '@/utils/got';
import { isValidHost } from '@/utils/valid-host';
import type { Context } from 'hono';
import { getHeaders, parseItem } from './utils';
import type { PostListResponse, UserInfoResponse } from './types';

export const route: Route = {
    path: '/:creator',
    categories: ['social-media'],
    example: '/fanbox/official',
    parameters: { creator: 'fanbox user name' },
    maintainers: ['KarasuShin'],
    name: 'Creator',
    handler,
    features: {
        requireConfig: [
            {
                name: 'FANBOX_SESSION_ID',
                description: 'Required for private posts. Can be found in browser DevTools -> Application -> Cookies -> https://www.fanbox.cc -> FANBOXSESSID',
                optional: true,
            },
        ],
    },
};

async function handler(ctx: Context): Promise<Data> {
    const creator = ctx.req.param('creator');
    if (!isValidHost(`creator`)) {
        throw new InvalidParameterError('Invalid user name');
    }

    let title = `Fanbox - ${creator}`;

    let description: string | undefined;

    let image: string | undefined;

    try {
        const user_api = `https://api.fanbox.cc/creator.get?creatorId=${creator}`;
        const userInfoResponse = (
            await got(user_api, {
                headers: getHeaders(),
            })
        ).data as UserInfoResponse;
        title = `Fanbox - ${userInfoResponse.body.user.name}`;
        description = userInfoResponse.body.description;
        image = userInfoResponse.body.user.iconUrl;
    } catch {
        // ignore
    }

    const postListResponse = (await got(`https://api.fanbox.cc/post.listCreator?creatorId=${creator}&limit=20`, { headers: getHeaders() })).data as PostListResponse;
    const items = await Promise.all(postListResponse.body.items.map((i) => parseItem(i)));

    return {
        title,
        link: `https://${creator}.fanbox.cc`,
        description,
        image,
        item: items,
    };
}

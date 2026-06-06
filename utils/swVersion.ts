/**
 * 查询当前激活 Service Worker 的版本号。
 *
 * 通过 MessageChannel + postMessage 的 GET_SW_VERSION 协议向 SW 询问，
 * SW 在 worker/sw-keep-alive.ts 里用 event.ports[0].postMessage({ version }) 回包。
 *
 * 超时返回 '?'：用一个 1.5s 的总超时 race 整个流程，而不仅是回包那一步。
 * 关键点——navigator.serviceWorker.ready 在没有 SW 接管页面时（隐私模式、
 * 浏览器禁用 SW、首次注册完成前）会永远 pending，单独 await 它会无限挂起，
 * 让调用方（如 Settings 底部版本信息）一直卡在加载态。所以连 .ready 一起 race。
 *
 * BuildBadge（右下角开发指示器）与 Settings 底部的版本信息都复用这个函数。
 */
const SW_QUERY_TIMEOUT_MS = 1500;

export async function querySwVersion(): Promise<string> {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return '?';

    const query = (async (): Promise<string> => {
        const reg = await navigator.serviceWorker.ready;
        const target = reg.active || reg.waiting || reg.installing;
        if (!target) return '?';
        return await new Promise<string>((resolve) => {
            const channel = new MessageChannel();
            channel.port1.onmessage = (e) => resolve(e.data?.version ?? '?');
            target.postMessage({ type: 'GET_SW_VERSION' }, [channel.port2]);
        });
    })();

    const timeout = new Promise<string>((resolve) => setTimeout(() => resolve('?'), SW_QUERY_TIMEOUT_MS));

    try {
        return await Promise.race([query, timeout]);
    } catch {
        return '?';
    }
}

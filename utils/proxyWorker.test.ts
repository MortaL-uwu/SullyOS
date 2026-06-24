import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_PROXY_WORKER,
  getProxyWorkerUrl,
  setProxyWorkerUrl,
  isCustomProxyWorker,
} from './proxyWorker';

const LS_KEY = 'sully_proxy_worker_url_v1';

describe('proxyWorker 中心配置', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('没设过时返回默认地址', () => {
    expect(getProxyWorkerUrl()).toBe(DEFAULT_PROXY_WORKER);
    expect(isCustomProxyWorker()).toBe(false);
  });

  it('设了自定义地址后读得到，且标记为自定义', () => {
    setProxyWorkerUrl('https://my-worker.example.com');
    expect(getProxyWorkerUrl()).toBe('https://my-worker.example.com');
    expect(isCustomProxyWorker()).toBe(true);
  });

  it('去掉首尾空格和结尾斜杠', () => {
    setProxyWorkerUrl('  https://my-worker.example.com///  ');
    expect(getProxyWorkerUrl()).toBe('https://my-worker.example.com');
  });

  it('填的就是默认地址 → 清空存储，回落默认', () => {
    setProxyWorkerUrl('https://my-worker.example.com');
    expect(isCustomProxyWorker()).toBe(true);
    setProxyWorkerUrl(DEFAULT_PROXY_WORKER);
    expect(localStorage.getItem(LS_KEY)).toBeNull();
    expect(getProxyWorkerUrl()).toBe(DEFAULT_PROXY_WORKER);
  });

  it('传空字符串 → 清空存储，回落默认', () => {
    setProxyWorkerUrl('https://my-worker.example.com');
    setProxyWorkerUrl('');
    expect(localStorage.getItem(LS_KEY)).toBeNull();
    expect(getProxyWorkerUrl()).toBe(DEFAULT_PROXY_WORKER);
  });

  it('非法地址（不带 http/https）→ 不写入', () => {
    setProxyWorkerUrl('my-worker.example.com'); // 缺协议
    expect(localStorage.getItem(LS_KEY)).toBeNull();
    expect(getProxyWorkerUrl()).toBe(DEFAULT_PROXY_WORKER);
  });

  it('存量里如果是脏数据（非 http）→ 读取时回落默认', () => {
    localStorage.setItem(LS_KEY, 'javascript:alert(1)');
    expect(getProxyWorkerUrl()).toBe(DEFAULT_PROXY_WORKER);
  });

  it('旧的 *.workers.dev 默认域名 → 读取时迁移回默认', () => {
    localStorage.setItem(LS_KEY, 'https://sully-n.qegj567.workers.dev');
    expect(getProxyWorkerUrl()).toBe(DEFAULT_PROXY_WORKER);
  });

  it('http（非 https）的自定义地址也接受', () => {
    setProxyWorkerUrl('http://localhost:8787');
    expect(getProxyWorkerUrl()).toBe('http://localhost:8787');
  });
});

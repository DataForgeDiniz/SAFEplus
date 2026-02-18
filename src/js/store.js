const KEY='safeplus_vault';
export function load(){const raw=localStorage.getItem(KEY);return raw?JSON.parse(raw):null}
export function save(meta){localStorage.setItem(KEY, JSON.stringify(meta))}
export function exportVault(){return localStorage.getItem(KEY)||'{}'}
export function importVault(json){localStorage.setItem(KEY,json)}
import {readFile,writeFile}from 'node:fs/promises';import{createHash}from 'node:crypto';
const hashes=[];for(const f of ['public/index.html','public/vso/index.html']){const html=await readFile(f,'utf8');for(const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g))hashes.push("'sha256-"+createHash('sha256').update(m[1]).digest('base64')+"'");}
const toml=await readFile('netlify.toml','utf8');await writeFile('netlify.toml',toml.replace(/script-src [^;]+;/,"script-src 'self' "+hashes.join(' ')+';'));console.log('Updated CSP hashes for embedded scripts.');

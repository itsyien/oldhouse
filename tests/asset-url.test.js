import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {assetUrl} from '../src/asset-url.js';

test('all game assets resolve below the Pages project path and exist with exact filename case',()=>{
 const manifest=JSON.parse(fs.readFileSync(new URL('../public/assets/apartment/runtime-manifest.json',import.meta.url)));
 const scareModels=Object.values(manifest.scares).flatMap(s=>s.model?[s.model.url]:[]);
 const audioFiles=JSON.parse(fs.readFileSync(new URL('../public/assets/audio/sources.json',import.meta.url)));
 const paths=['/assets/apartment/floors.json','/assets/apartment/runtime-manifest.json',...Object.values(manifest.textures).map(a=>a.url),...Object.values(manifest.models),...Object.values(manifest.characterModels).map(a=>a.url),...scareModels,...audioFiles.map(a=>`/assets/audio/${a.file}`)];
 for(const path of paths){
  assert.equal(assetUrl(path,'/oldhouse/'),'/oldhouse'+path);
  assert.equal(assetUrl(path,'/'),path);
  const file=new URL('../public'+path,import.meta.url);
  assert(fs.existsSync(file),path);
  assert(fs.readdirSync(new URL('.',file)).includes(decodeURIComponent(file.pathname.split('/').at(-1))),path);
 }
});

import {defineConfig} from 'vite';
export default defineConfig(({command,isPreview})=>({base:command==='serve'&&!isPreview?'/':'/oldhouse/',server:{watch:{ignored:['**/work/**','**/outputs/**']}}}));

// ==UserScript==
// @id local-demo
// @name 本地演示工具
// @version 0.1.0
// @match http://127.0.0.1/*
// @match http://localhost/*
// @grant none
// ==/UserScript==
WebMCPScript.install({
  id: 'local-demo',
  matches: ['http://127.0.0.1/*','http://localhost/*'],
  tools: [{
    name: 'read_page',
    description: '读取当前本地演示页面的标题、路由和文字，不修改页面。',
    inputSchema: {type:'object', properties:{}, additionalProperties:false},
    execute: async () => ({title:document.title, url:location.href, text:document.body.innerText.slice(0,4000)})
  }, {
    name: 'sum',
    description: '计算两个数字之和，仅用于验证独立脚本调用。',
    inputSchema: {type:'object', properties:{a:{type:'number'}, b:{type:'number'}},required:['a','b'],additionalProperties:false},
    execute: async ({a,b}) => {if(!Number.isFinite(a)||!Number.isFinite(b)) throw Error('a、b 必须为有限数字');return {sum:a+b};}
  }]
});

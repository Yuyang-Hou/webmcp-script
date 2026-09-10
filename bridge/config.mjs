import {mkdir,readFile,writeFile,link,unlink} from 'node:fs/promises';
import {randomBytes,randomUUID} from 'node:crypto';
export const {version}=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
export const stateDir=new URL('../.local/',import.meta.url);
export const tokenPath=new URL('pairing-token',stateDir);
export async function config() {
  await mkdir(stateDir,{recursive:true,mode:0o700});
  let token=process.env.WEBMCP_TOKEN;
  if(!token) {
    try {token=(await readFile(tokenPath,'utf8')).trim();}
    catch(error) {
      if(error.code!=='ENOENT')throw error;
      const temp=new URL(`pairing-${randomUUID()}.tmp`,stateDir);
      await writeFile(temp,randomBytes(32).toString('hex'),{mode:0o600,flag:'wx'});
      try {await link(temp,tokenPath);} catch(error) {if(error.code!=='EEXIST')throw error;}
      finally {await unlink(temp);}
      token=(await readFile(tokenPath,'utf8')).trim();
    }
  }
  if(token.length<32)throw Error('WEBMCP_TOKEN must contain at least 32 characters');
  const port=Number(process.env.WEBMCP_PORT||17891),idleMs=Number(process.env.WEBMCP_IDLE_MS||60000);
  if(!Number.isInteger(port)||port<1||port>65535)throw Error('WEBMCP_PORT must be an integer from 1 to 65535');
  if(!Number.isInteger(idleMs)||idleMs<500||idleMs>3600000)throw Error('WEBMCP_IDLE_MS must be 500..3600000');
  return {token,port,idleMs};
}

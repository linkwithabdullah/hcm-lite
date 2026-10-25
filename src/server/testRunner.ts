/** HCM Lite integration smoke suite.
 * Requires a fresh disposable TEST_DATABASE_URL; never runs on DATABASE_URL.
 */
import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { SqliteDb } from './db';
import { createApiRouter } from './routes';
export interface TestResult {
  id:string; name:string; action:string; expected:string; actual:string;
  status:'PASS'|'FAIL'; severity:'Critical'|'High'|'Medium'|'Low';
}
export interface TestSuiteReport {timestamp:string;total:number;passed:number;failed:number;results:TestResult[];}
export async function runTestSuite():Promise<TestSuiteReport>{
  const testUrl=process.env.TEST_DATABASE_URL;
  if(!testUrl || testUrl===process.env.DATABASE_URL) throw new Error('Use a NEW disposable TEST_DATABASE_URL, never DATABASE_URL.');
  if(!process.env.ADMIN_PASSWORD)throw new Error('ADMIN_PASSWORD must be provided for test initialization.');
  const db=new SqliteDb(testUrl);
  const results:TestResult[]=[];
  const check=(id:string,name:string,condition:boolean,actual:string,severity:TestResult['severity']='High')=>
    results.push({id,name,action:name,expected:'PASS',actual,status:condition?'PASS':'FAIL',severity});
  try {
    await db.init();
    const employees=await db.query('SELECT id FROM employees');
    const users=await db.query<any>('SELECT role FROM users');
    const leaves=await db.query<any>('SELECT name,yearly_quota,is_paid FROM leave_types ORDER BY name');
    check('INIT-01','Fresh database has no example employees',employees.length===0,`employees=${employees.length}`,'Critical');
    check('INIT-02','Fresh database contains one Superadmin',users.length===1&&users[0].role==='SUPERADMIN',`users=${users.length}`,'Critical');
    const quotas:Object=Object.fromEntries(leaves.map((x:any)=>[x.name,x.yearly_quota]));
    check('INIT-03','Annual/Sick/Casual/Unpaid leave types seeded',
      (quotas as any).Annual===14&&(quotas as any).Sick===8&&(quotas as any).Casual===10&&(quotas as any).Unpaid===null,
      JSON.stringify(quotas),'High');
    const app=express();app.use(express.json());app.use('/api/v1',createApiRouter(db));
    const server=app.listen(0,'127.0.0.1');
    try{
      const address=server.address();
      if(!address||typeof address==='string')throw new Error('Failed to create test HTTP listener');
      const api=async(method:string,path:string,body?:any,token?:string)=>{
        const r=await fetch(`http://127.0.0.1:${address.port}/api/v1${path}`,{
          method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},
          ...(body?{body:JSON.stringify(body)}:{})
        });
        let data:any;try{data=await r.json();}catch{data={}}return {status:r.status,data};
      };
      const login=await api('POST','/auth/login',{identifier:process.env.ADMIN_USERNAME||'superadmin',password:process.env.ADMIN_PASSWORD});
      const token=login.data?.data?.accessToken;
      check('AUTH-01','Seeded Admin can log in',login.status===200&&!!token,`HTTP ${login.status}`,'Critical');
      if(token){
        const gate=await api('GET','/settings',undefined,token);
        check('AUTH-02','Forced password change gate',gate.status===403,`HTTP ${gate.status}`,'Critical');
        const user=await api('GET','/auth/me',undefined,token);
        check('AUTH-03','User JSON contains no password hash',user.status===200&&!JSON.stringify(user.data).includes('password_hash'),`HTTP ${user.status}`,'Critical');
        const changed=await api('POST','/auth/change-password',{currentPassword:process.env.ADMIN_PASSWORD,newPassword:'HcmTest#Secure2026!'},token);
        check('AUTH-04','First password change succeeds',changed.status===200,`HTTP ${changed.status}`,'Critical');
        const stale=await api('GET','/settings',undefined,token);
        check('AUTH-05','Old JWT revoked after password change',stale.status===401,`HTTP ${stale.status}`,'Critical');
        const newToken=changed.data?.data?.accessToken;
        if(newToken){
          const setting=await api('GET','/settings',undefined,newToken);
          check('SET-01','Settings available after change',setting.status===200,`HTTP ${setting.status}`);
        }
      }
      const bogus=await api('GET','/settings',undefined,'tampered-token');
      check('AUTH-06','Forged JWT rejected',bogus.status===401,`HTTP ${bogus.status}`,'Critical');
    }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
    const passed=results.filter(x=>x.status==='PASS').length;
    return {timestamp:new Date().toISOString(),total:results.length,passed,failed:results.length-passed,results};
  }finally{await db.close();}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  runTestSuite().then(result=>{
    console.log(JSON.stringify(result,null,2));if(result.failed)process.exitCode=1;
  }).catch(err=>{console.error(err);process.exitCode=1;});
}

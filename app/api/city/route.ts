import {queryCity,validateQuery,type CityQuery} from '../../../lib/city';
export async function GET(request:Request){
 let query:CityQuery;
 try{query=validateQuery(new URL(request.url).searchParams)}
 catch(e){return Response.json({error:e instanceof Error?e.message:'Invalid query conditions.'},{status:400})}
 try{
  const result=await queryCity(query);
  return Response.json(result,{headers:{'Cache-Control':'private, max-age=90'}});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'City data could not be retrieved.'},{status:503})}
}

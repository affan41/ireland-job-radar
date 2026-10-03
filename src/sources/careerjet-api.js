import {getJSON} from './http.js'
export const CAREERJET_API = 'https://search.api.careerjet.net/v4/query'
export function careerjetAccessIssue({apiKey,requestContext}={}) {
  if(!apiKey)return 'Careerjet publisher API key not configured; use the search shortcut'
  if(!requestContext?.userIp||!requestContext?.userAgent)return 'Careerjet requires a user-triggered request with actual client details; skipped for scheduled collection'
  return null
}
export async function careerjetQuery(params,{apiKey,requestContext,request=getJSON}) {
  const issue=careerjetAccessIssue({apiKey,requestContext});if(issue)throw new Error(issue)
  params.set('user_ip',requestContext.userIp);params.set('user_agent',requestContext.userAgent)
  return request(`${CAREERJET_API}?${params}`,{headers:{Authorization:`Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`}})
}

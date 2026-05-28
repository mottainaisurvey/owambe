#!/usr/bin/env python3
"""
Railway Domain Query Script
Queries all custom domains across all services in the Railway project
and prints their sync status and DNS verification details.
"""
import urllib.request
import json
import os

token = os.environ['RAILWAY_TOKEN']
url = "https://backboard.railway.app/graphql/v2"


def gql(query, variables=None):
    payload = json.dumps({"query": query, "variables": variables or {}}).encode()
    req = urllib.request.Request(url, data=payload, headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    })
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


query = """
{
  me {
    projects {
      edges {
        node {
          id
          name
          services {
            edges {
              node {
                id
                name
                serviceInstances {
                  edges {
                    node {
                      id
                      environmentId
                      domains {
                        customDomains {
                          id
                          domain
                          syncStatus
                          status {
                            cdnProvider
                            certificateStatus
                            verified
                            dnsRecords {
                              zone
                              subdomain
                              recordType
                              required
                              currentValue
                              expectedValue
                              isGood
                            }
                          }
                        }
                        serviceDomains {
                          id
                          domain
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
"""

print("=== Railway Custom Domain Status ===")
result = gql(query)

if "errors" in result:
    print("GraphQL errors:", json.dumps(result["errors"], indent=2))
else:
    data = result.get("data", {})
    projects = data.get("me", {}).get("projects", {}).get("edges", [])
    for proj_edge in projects:
        proj = proj_edge["node"]
        print(f"\nProject: {proj['name']} ({proj['id']})")
        for svc_edge in proj.get("services", {}).get("edges", []):
            svc = svc_edge["node"]
            print(f"  Service: {svc['name']} ({svc['id']})")
            for inst_edge in svc.get("serviceInstances", {}).get("edges", []):
                inst = inst_edge["node"]
                domains = inst.get("domains", {})
                custom_domains = domains.get("customDomains", [])
                service_domains = domains.get("serviceDomains", [])
                print(f"    Instance: {inst['id']} (env: {inst['environmentId']})")
                for sd in service_domains:
                    print(f"      Railway domain: {sd['domain']}")
                for cd in custom_domains:
                    print(f"      Custom domain: {cd['domain']}")
                    print(f"        syncStatus: {cd.get('syncStatus')}")
                    status = cd.get("status") or {}
                    print(f"        verified: {status.get('verified')}")
                    print(f"        certificateStatus: {status.get('certificateStatus')}")
                    print(f"        cdnProvider: {status.get('cdnProvider')}")
                    for dns in (status.get("dnsRecords") or []):
                        good = "OK" if dns.get("isGood") else "FAIL"
                        print(f"        DNS [{good}] {dns.get('recordType')} {dns.get('subdomain')} expected={dns.get('expectedValue')} current={dns.get('currentValue')}")

print("\n=== Full JSON output ===")
print(json.dumps(result, indent=2))

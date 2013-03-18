# proxy-dashboard
A web-based dashboard for showing how accurate the servers being tested by the proxy are.

NOTE: Right now (due to node-azure dependancy) this will not run on Node.js 0.10.x. The Azure team is working on compatibility with the latest version of node now.


# deploying the dashboard

## 1) Install dependancies:
   npm install

## 2) Set environment variables:

Windows:
   set AZURE_STORAGE_ACCOUNT_1=[account-name]
   set AZURE_STORAGE_ACCESS_KEY_1=[access-key]
   set AZURE_STORAGE_ACCOUNT_2=[account-name]
   set AZURE_STORAGE_ACCESS_KEY_2=[access-key]
   ...
   set AZURE_STORAGE_ACCOUNT_N=[account-name]
   set AZURE_STORAGE_ACCESS_KEY_N=[access-key]

OSX:
   export AZURE_STORAGE_ACCOUNT_1=[account-name]
   export AZURE_STORAGE_ACCESS_KEY_1=[access-key]
   export AZURE_STORAGE_ACCOUNT_2=[account-name]
   export AZURE_STORAGE_ACCESS_KEY_2=[access-key]
   ...
   export AZURE_STORAGE_ACCOUNT_N=[account-name]
   export AZURE_STORAGE_ACCESS_KEY_N=[access-key]

## 3) Start the server
   node server

You should now have a server running on http://localhost:8888/!


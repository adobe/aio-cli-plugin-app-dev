#!/usr/bin/env node
/*
Copyright 2024 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

/**
 * Universal Restate Service Server Shim
 * 
 * This script loads an agent or orchestrator bundle and serves it with Restate.
 * Service files only need to export their agent/orchestrator object - they don't need to call restate.serve()
 * 
 * Supports: agents (*Agent) and orchestrators (*Orchestrator)
 * 
 * Usage: node agent-server.js <path-to-service-bundle>
 */

const path = require('path')

// CRITICAL: Load Restate SDK from the PROJECT's node_modules, not the CLI plugin's
// The bundle was built against the project's SDK instance, so we must use the same instance
const projectRoot = process.cwd()
const restate = require(require.resolve('@restatedev/restate-sdk', {
  paths: [projectRoot]
}))

// Get service path from command line args
const servicePath = process.argv[2]
if (!servicePath) {
  console.error('Error: Service path is required')
  console.error('Usage: node agent-server.js <path-to-service-bundle>')
  process.exit(1)
}

const resolvedServicePath = path.resolve(servicePath)

// Import the service module
let serviceModule
try {
  serviceModule = require(resolvedServicePath)
} catch (error) {
  console.error(`Failed to load service from ${resolvedServicePath}:`, error.message)
  process.exit(1)
}

// Find the service object from the module exports
const service = findServiceExport(serviceModule)

if (!service) {
  console.error(`Error: No valid Restate service found in ${resolvedServicePath}`)
  console.error('Service files must export a named export called "agent" or "orchestrator".')
  console.error('Examples:')
  console.error('  - export const agent = restate.object({...})')
  console.error('  - export const orchestrator = restate.object({...})')
  console.error('  - export default restate.object({...})')
  process.exit(1)
}

// Get port from environment (set by AgentRunner)
const PORT = parseInt(process.env.PORT || '9200')

// Serve the service
try {
  restate.serve({
    services: [service],
    port: PORT
  })
  console.log(`✓ Restate service serving on port ${PORT}`)
} catch (error) {
  console.error(`Failed to serve service on port ${PORT}:`, error.message)
  process.exit(1)
}

/**
 * Attempts to find a valid Restate service export from the module
 * Looks for named exports: 'agent' or 'orchestrator', or default export
 * No fallbacks - export must be explicitly named
 * 
 * @param {object} module - The loaded module
 * @returns {object|null} - The service object or null if not found
 */
function findServiceExport (module) {
  if (!module || typeof module !== 'object') {
    return null
  }

  // Look for named export 'agent'
  if (module.agent && typeof module.agent === 'object') {
    return module.agent
  }

  // Look for named export 'orchestrator'
  if (module.orchestrator && typeof module.orchestrator === 'object') {
    return module.orchestrator
  }

  // Check for default export
  if (module.default && typeof module.default === 'object') {
    return module.default
  }

  // No valid export found - strict mode, no fallbacks
  return null
}


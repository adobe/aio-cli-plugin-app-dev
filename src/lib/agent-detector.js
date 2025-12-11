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
 * Detects if actions are agents based on runtime identifier
 * Agents are identified by runtime 'nodejs:22'
 * 
 * @param {object} packages - The packages object from manifest
 * @returns {object} { agents: [], regularActions: [], hasAgents: boolean }
 */
function detectAgents(packages) {
  const agents = []
  const regularActions = []
  
  if (!packages || typeof packages !== 'object') {
    return { agents, regularActions, hasAgents: false }
  }
  
  for (const [packageName, pkg] of Object.entries(packages)) {
    for (const [actionName, action] of Object.entries(pkg.actions || {})) {
      const actionInfo = {
        name: actionName,
        function: action.function,
        runtime: action.runtime,
        inputs: action.inputs || {},
        package: packageName
      }
      
      if (action.runtime && action.runtime === 'nodejs:22') {
        agents.push(actionInfo)
      } else {
        regularActions.push(actionInfo)
      }
    }
  }
  
  return { 
    agents, 
    regularActions, 
    hasAgents: agents.length > 0 
  }
}

module.exports = { detectAgents }


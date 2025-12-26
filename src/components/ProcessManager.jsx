import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Plus, Trash2, RefreshCw, BarChart3, Clock, Cpu, Edit, X } from 'lucide-react';

const ProcessManager = () => {
  const [processes, setProcesses] = useState([]);
  const [nextPid, setNextPid] = useState(1);
  const [isRunning, setIsRunning] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [algorithm, setAlgorithm] = useState('RoundRobin');
  const [timeQuantum, setTimeQuantum] = useState(2);
  const [currentProcess, setCurrentProcess] = useState(null);
  const [quantumUsed, setQuantumUsed] = useState(0);
  const [executionHistory, setExecutionHistory] = useState([]);
  const [view, setView] = useState('dashboard');
  const [simulationInterval, setSimulationInterval] = useState(null);
  
  // RR Ready Queue - stores PIDs in FIFO order
  const [readyQueue, setReadyQueue] = useState([]);
  
  // Refs to track state without causing re-renders
  const currentProcessRef = useRef(null);
  const readyQueueRef = useRef([]);
  const quantumUsedRef = useRef(0);
  const processesRef = useRef([]);
  const algorithmRef = useRef('RoundRobin');
  const timeQuantumRef = useRef(2);
  
  // State for user-defined process creation
  const [showProcessForm, setShowProcessForm] = useState(false);
  const [newProcessName, setNewProcessName] = useState('');
  const [newProcessBurst, setNewProcessBurst] = useState(5);
  const [newProcessPriority, setNewProcessPriority] = useState(3);
  const [editingPriority, setEditingPriority] = useState(null);
  const [tempPriority, setTempPriority] = useState('');

  const STATES = {
    NEW: 'New',
    READY: 'Ready',
    RUNNING: 'Running',
    WAITING: 'Waiting',
    TERMINATED: 'Terminated'
  };

  // Create new process
  const createProcess = (userDefined = false) => {
    if (userDefined && !newProcessName.trim()) {
      alert('Please enter a process name');
      return;
    }
    
    const burstTime = userDefined ? parseInt(newProcessBurst) : Math.floor(Math.random() * 8) + 3;
    const priority = userDefined ? parseInt(newProcessPriority) : Math.floor(Math.random() * 5) + 1;
    const name = userDefined ? newProcessName : `P${nextPid}`;
    
    const newProcess = {
      pid: nextPid,
      name: name,
      state: STATES.NEW,
      burstTime: burstTime,
      remainingTime: burstTime,
      priority: priority,
      arrivalTime: currentTime,
      startTime: null,
      completionTime: null,
      waitingTime: 0,
      turnaroundTime: 0,
      cpuTime: 0,
      lastReadyTime: currentTime,
    };

    setProcesses(prev => [...prev, newProcess]);
    setNextPid(prev => prev + 1);

    // Reset form if user-defined
    if (userDefined) {
      setNewProcessName('');
      setNewProcessBurst(5);
      setNewProcessPriority(3);
      setShowProcessForm(false);
    }

    // Move to READY state
    setTimeout(() => {
      setProcesses(prev => prev.map(p => 
        p.pid === newProcess.pid ? { 
          ...p, 
          state: STATES.READY,
          lastReadyTime: currentTime
        } : p
      ));
      
      // Add to RR ready queue
      if (algorithm === 'RoundRobin') {
        setReadyQueue(prev => [...prev, newProcess.pid]);
      }
    }, 100);
  };

  // Get next process based on scheduling algorithm
  const getNextProcess = () => {
    const readyProcesses = processes.filter(p => p.state === STATES.READY);
    
    if (readyProcesses.length === 0) return null;
    
    switch (algorithm) {
      case 'FCFS':
        return readyProcesses.sort((a, b) => a.arrivalTime - b.arrivalTime)[0];
      case 'SJF':
        return readyProcesses.sort((a, b) => a.remainingTime - b.remainingTime)[0];
      case 'Priority':
        return readyProcesses.sort((a, b) => a.priority - b.priority)[0];
      case 'RoundRobin':
        // Get from FIFO queue
        if (readyQueue.length > 0) {
          const nextPid = readyQueue[0];
          return readyProcesses.find(p => p.pid === nextPid);
        }
        return null;
      default:
        return readyProcesses[0];
    }
  };

  // Update priority for existing process
  const updateProcessPriority = (pid, newPriority) => {
    if (newPriority < 1 || newPriority > 10) {
      alert('Priority must be between 1 and 10');
      return;
    }
    
    setProcesses(prev => prev.map(p => 
      p.pid === pid ? { ...p, priority: parseInt(newPriority) } : p
    ));
    setEditingPriority(null);
  };

  // Start editing priority
  const startEditingPriority = (pid, currentPriority) => {
    setEditingPriority(pid);
    setTempPriority(currentPriority.toString());
  };

  // Cancel editing
  const cancelEditing = () => {
    setEditingPriority(null);
    setTempPriority('');
  };

  // Terminate process manually
  const terminateProcess = (pid) => {
    setProcesses(prev => prev.map(p => {
      if (p.pid === pid && p.state !== STATES.TERMINATED) {
        return {
          ...p,
          state: STATES.TERMINATED,
          completionTime: currentTime,
          turnaroundTime: currentTime - p.arrivalTime,
          remainingTime: 0
        };
      }
      return p;
    }));
    
    // Remove from ready queue
    setReadyQueue(prev => prev.filter(p => p !== pid));
    
    if (currentProcess?.pid === pid) {
      setCurrentProcess(null);
      setQuantumUsed(0);
    }
  };

  // Update refs whenever state changes
  useEffect(() => {
    currentProcessRef.current = currentProcess;
    readyQueueRef.current = readyQueue;
    quantumUsedRef.current = quantumUsed;
    processesRef.current = processes;
    algorithmRef.current = algorithm;
    timeQuantumRef.current = timeQuantum;
  }, [currentProcess, readyQueue, quantumUsed, processes, algorithm, timeQuantum]);

  // FIXED: Main scheduling simulation - Proper RR implementation
  useEffect(() => {
    if (!isRunning) {
      if (simulationInterval) {
        clearInterval(simulationInterval);
        setSimulationInterval(null);
      }
      return;
    }

    const interval = setInterval(() => {
      setCurrentTime(prevTime => {
        const newTime = prevTime + 1;
        let shouldPreempt = false;
        let shouldTerminate = false;
        
        // Step 0: Check if RR quantum expired FIRST (before any execution)
        if (currentProcessRef.current && algorithmRef.current === 'RoundRobin' && quantumUsedRef.current >= timeQuantumRef.current) {
          shouldPreempt = true;
        }

        // Step 1: Schedule process if needed
        if (!currentProcessRef.current || shouldPreempt) {
          setCurrentProcess(prevCP => {
            if (shouldPreempt && prevCP) {
              // Preempt the current process
              setProcesses(prevProcesses => 
                prevProcesses.map(p =>
                  p.pid === prevCP.pid 
                    ? { ...p, state: STATES.READY, lastReadyTime: newTime }
                    : p
                )
              );
              
              setReadyQueue(prevQueue => {
                const newQueue = prevQueue.filter(pid => pid !== prevCP.pid);
                return [...newQueue, prevCP.pid];
              });
              
              return null;
            }
            
            // Schedule next process
            const readyProcesses = processesRef.current.filter(p => p.state === STATES.READY);
            
            if (readyProcesses.length > 0) {
              let nextProc = null;
              
              switch (algorithmRef.current) {
                case 'FCFS':
                  nextProc = readyProcesses.sort((a, b) => a.arrivalTime - b.arrivalTime)[0];
                  break;
                case 'SJF':
                  nextProc = readyProcesses.sort((a, b) => a.remainingTime - b.remainingTime)[0];
                  break;
                case 'Priority':
                  nextProc = readyProcesses.sort((a, b) => a.priority - b.priority)[0];
                  break;
                case 'RoundRobin':
                  if (readyQueueRef.current.length > 0) {
                    nextProc = readyProcesses.find(p => p.pid === readyQueueRef.current[0]);
                  }
                  break;
                default:
                  nextProc = readyProcesses[0];
              }
              
              if (nextProc) {
                setQuantumUsed(0);
                
                // Update to RUNNING state
                setProcesses(prevProcesses => prevProcesses.map(p => 
                  p.pid === nextProc.pid 
                    ? { ...p, state: STATES.RUNNING, startTime: p.startTime === null ? newTime : p.startTime } 
                    : p
                ));
                
                // Remove from RR queue
                if (algorithmRef.current === 'RoundRobin') {
                  setReadyQueue(prevQueue => prevQueue.slice(1));
                }
                
                return nextProc;
              }
            }
            return null;
          });
        }
        
        // Step 2: Update waiting times
        setProcesses(prevProcesses => prevProcesses.map(p => {
          if (p.state === STATES.READY && p.pid !== currentProcessRef.current?.pid) {
            return { ...p, waitingTime: p.waitingTime + 1 };
          }
          return p;
        }));

        // Step 3: Execute ONLY if not preempting
        if (!shouldPreempt && currentProcessRef.current) {
          const cpToExecute = currentProcessRef.current;
          
          setProcesses(prevProcesses => {
            const updated = [...prevProcesses];
            const runningIdx = updated.findIndex(p => p.pid === cpToExecute.pid);
            
            if (runningIdx !== -1 && updated[runningIdx].state === STATES.RUNNING) {
              // Execute one time unit
              updated[runningIdx].remainingTime -= 1;
              updated[runningIdx].cpuTime += 1;
              
              if (updated[runningIdx].remainingTime < 0) {
                updated[runningIdx].remainingTime = 0;
              }

              // Add to execution history
              setExecutionHistory(prevHistory => [...prevHistory, {
                pid: cpToExecute.pid,
                name: cpToExecute.name,
                time: newTime
              }]);

              // Check if finished
              if (updated[runningIdx].remainingTime === 0) {
                updated[runningIdx].state = STATES.TERMINATED;
                updated[runningIdx].completionTime = newTime;
                updated[runningIdx].turnaroundTime = newTime - updated[runningIdx].arrivalTime;
                
                setReadyQueue(prevQueue => prevQueue.filter(pid => pid !== cpToExecute.pid));
                setCurrentProcess(null);
                setQuantumUsed(0);
              } else {
                // Still running - increment quantum for RR
                setQuantumUsed(prev => prev + 1);
              }
            }
            
            return updated;
          });
        }

        return newTime;
      });
    }, 1000); // 1 second per time unit

    setSimulationInterval(interval);

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRunning]);

  // Handle algorithm change
  useEffect(() => {
    if (algorithm === 'RoundRobin') {
      // Rebuild ready queue for RR based on arrival time
      const readyProcesses = processes
        .filter(p => p.state === STATES.READY)
        .sort((a, b) => a.arrivalTime - b.arrivalTime);
      
      setReadyQueue(readyProcesses.map(p => p.pid));
    } else {
      setReadyQueue([]);
    }
  }, [algorithm, processes]);

  // Create test processes from your table
  const createTestProcesses = () => {
    const testProcesses = [
      { name: 'P1', burst: 7, priority: 1 },
      { name: 'P2', burst: 9, priority: 2 },
      { name: 'P3', burst: 8, priority: 3 },
      { name: 'P4', burst: 9, priority: 2 },
      { name: 'P5', burst: 7, priority: 3 },
      { name: 'P6', burst: 9, priority: 1 },
      { name: 'P7', burst: 3, priority: 3 },
      { name: 'P8', burst: 4, priority: 2 },
      { name: 'P9', burst: 3, priority: 2 },
      { name: 'P10', burst: 3, priority: 1 }
    ];
    
    resetAll();
    
    setTimeout(() => {
      testProcesses.forEach((proc, index) => {
        setTimeout(() => {
          const newProcess = {
            pid: index + 1,
            name: proc.name,
            state: STATES.READY,
            burstTime: proc.burst,
            remainingTime: proc.burst,
            priority: proc.priority,
            arrivalTime: 0,
            startTime: null,
            completionTime: null,
            waitingTime: 0,
            turnaroundTime: 0,
            cpuTime: 0,
            lastReadyTime: 0,
          };
          
          setProcesses(prev => [...prev, newProcess]);
          if (algorithm === 'RoundRobin') {
            setReadyQueue(prev => [...prev, newProcess.pid]);
          }
        }, index * 50);
      });
      setNextPid(11);
    }, 100);
  };

  // Calculate statistics
  const getStats = () => {
    const terminated = processes.filter(p => p.state === STATES.TERMINATED);
    const ready = processes.filter(p => p.state === STATES.READY);
    const running = processes.filter(p => p.state === STATES.RUNNING);
    
    if (terminated.length === 0) {
      return {
        avgWaitingTime: 0,
        avgTurnaroundTime: 0,
        cpuUtilization: 0,
        totalProcesses: processes.length,
        readyProcesses: ready.length,
        runningProcesses: running.length,
        terminatedProcesses: 0
      };
    }

    const avgWaitingTime = (terminated.reduce((sum, p) => sum + p.waitingTime, 0) / terminated.length).toFixed(2);
    const avgTurnaroundTime = (terminated.reduce((sum, p) => sum + p.turnaroundTime, 0) / terminated.length).toFixed(2);
    const totalCpuTime = terminated.reduce((sum, p) => sum + p.cpuTime, 0);
    const cpuUtilization = currentTime > 0 ? ((totalCpuTime / currentTime) * 100).toFixed(2) : 0;

    return { 
      avgWaitingTime, 
      avgTurnaroundTime, 
      cpuUtilization,
      totalProcesses: processes.length,
      readyProcesses: ready.length,
      runningProcesses: running.length,
      terminatedProcesses: terminated.length
    };
  };

  const stats = getStats();

  // Reset function
  const resetAll = () => {
    setIsRunning(false);
    setProcesses([]);
    setCurrentProcess(null);
    setCurrentTime(0);
    setNextPid(1);
    setExecutionHistory([]);
    setQuantumUsed(0);
    setReadyQueue([]);
    if (simulationInterval) {
      clearInterval(simulationInterval);
      setSimulationInterval(null);
    }
  };

  const getStateColor = (state) => {
    const colors = {
      [STATES.NEW]: 'bg-gray-400',
      [STATES.READY]: 'bg-blue-500',
      [STATES.RUNNING]: 'bg-green-500',
      [STATES.WAITING]: 'bg-yellow-500',
      [STATES.TERMINATED]: 'bg-red-500'
    };
    return colors[state] || 'bg-gray-400';
  };

  const getProcessColor = (pid) => {
    const colors = ['bg-purple-500', 'bg-pink-500', 'bg-cyan-500', 'bg-orange-500', 'bg-lime-500', 'bg-indigo-500'];
    return colors[pid % colors.length];
  };

  const getPriorityColor = (priority) => {
    if (priority <= 2) return 'bg-red-500';
    if (priority <= 4) return 'bg-orange-500';
    if (priority <= 6) return 'bg-yellow-500';
    if (priority <= 8) return 'bg-blue-500';
    return 'bg-gray-500';
  };

  // Gantt Chart Component
  const GanttChart = () => {
    const maxTime = Math.max(currentTime, 20);

    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
          <BarChart3 size={24} />
          Gantt Chart - CPU Execution Timeline
        </h3>
        
        <div className="overflow-x-auto">
          <div className="min-w-max">
            <div className="flex mb-2">
              {Array.from({ length: maxTime + 1 }, (_, i) => (
                <div key={i} className="w-12 text-center text-xs text-gray-400 border-l border-gray-700">
                  {i}
                </div>
              ))}
            </div>

            <div className="relative h-16 bg-gray-900 rounded">
              {executionHistory.map((entry, idx) => (
                <div
                  key={idx}
                  className={`absolute h-12 top-2 ${getProcessColor(entry.pid)} border border-gray-600 flex items-center justify-center text-xs font-bold`}
                  style={{
                    left: `${(entry.time - 1) * 48}px`,
                    width: '48px'
                  }}
                  title={`${entry.name} at time ${entry.time}`}
                >
                  {entry.name}
                </div>
              ))}
            </div>

            <div className="flex gap-4 mt-4 flex-wrap">
              {[...new Set(processes.map(p => p.pid))].map(pid => {
                const proc = processes.find(p => p.pid === pid);
                return (
                  <div key={pid} className="flex items-center gap-2">
                    <div className={`w-4 h-4 rounded ${getProcessColor(pid)}`}></div>
                    <span className="text-sm">{proc?.name}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Dashboard View
  const DashboardView = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <Clock size={24} />
            <span className="text-3xl font-bold">{currentTime}</span>
          </div>
          <div className="text-sm opacity-90">System Time</div>
        </div>

        <div className="bg-gradient-to-br from-green-600 to-green-700 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <Cpu size={24} />
            <span className="text-3xl font-bold">{stats.cpuUtilization}%</span>
          </div>
          <div className="text-sm opacity-90">CPU Utilization</div>
        </div>

        <div className="bg-gradient-to-br from-purple-600 to-purple-700 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <BarChart3 size={24} />
            <span className="text-3xl font-bold">{stats.totalProcesses}</span>
          </div>
          <div className="text-sm opacity-90">Total Processes</div>
        </div>

        <div className="bg-gradient-to-br from-orange-600 to-orange-700 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <Play size={24} />
            <span className="text-3xl font-bold">{stats.runningProcesses}</span>
          </div>
          <div className="text-sm opacity-90">Running</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gray-800 rounded-lg p-6">
          <div className="text-gray-400 text-sm mb-2">Average Waiting Time</div>
          <div className="text-4xl font-bold text-blue-400">{stats.avgWaitingTime}</div>
          <div className="text-xs text-gray-500 mt-2">time units</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-6">
          <div className="text-gray-400 text-sm mb-2">Average Turnaround Time</div>
          <div className="text-4xl font-bold text-green-400">{stats.avgTurnaroundTime}</div>
          <div className="text-xs text-gray-500 mt-2">time units</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-6">
          <div className="text-gray-400 text-sm mb-2">Context Switches</div>
          <div className="text-4xl font-bold text-purple-400">
            {executionHistory.length > 0 ? 
              executionHistory.filter((e, i, arr) => i === 0 || e.pid !== arr[i-1].pid).length : 0}
          </div>
          <div className="text-xs text-gray-500 mt-2">switches</div>
        </div>
      </div>

      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-xl font-bold mb-4">Process State Distribution</h3>
        <div className="grid grid-cols-5 gap-4">
          {Object.values(STATES).map(state => {
            const count = processes.filter(p => p.state === state).length;
            return (
              <div key={state} className="text-center">
                <div className={`${getStateColor(state)} rounded-lg py-8 mb-2 flex items-center justify-center`}>
                  <span className="text-3xl font-bold">{count}</span>
                </div>
                <div className="text-sm text-gray-400">{state}</div>
              </div>
            );
          })}
        </div>
      </div>

      {currentProcess && (
        <div className="bg-gradient-to-r from-green-600 to-green-700 rounded-lg p-6">
          <h3 className="text-xl font-bold mb-2">Currently Executing</h3>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl font-bold">{currentProcess.name} (PID: {currentProcess.pid})</div>
              <div className="text-sm opacity-90 mt-1">
                Remaining: {currentProcess.remainingTime} | Burst: {currentProcess.burstTime} | Priority: {currentProcess.priority}
              </div>
            </div>
            {algorithm === 'RoundRobin' && (
              <div className="text-right">
                <div className="text-sm opacity-90">Time Quantum</div>
                <div className="text-2xl font-bold">{quantumUsed}/{timeQuantum}</div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-xl font-bold mb-4">
          Ready Queue ({algorithm === 'RoundRobin' ? readyQueue.length : stats.readyProcesses} processes)
        </h3>
        <div className="flex gap-2 flex-wrap">
          {(() => {
            let queueToShow;
            if (algorithm === 'RoundRobin') {
              // Show RR queue order
              queueToShow = readyQueue
                .map(pid => processes.find(p => p.pid === pid))
                .filter(Boolean);
            } else {
              // Show sorted by algorithm
              queueToShow = processes
                .filter(p => p.state === STATES.READY)
                .sort((a, b) => {
                  if (algorithm === 'FCFS') return a.arrivalTime - b.arrivalTime;
                  if (algorithm === 'SJF') return a.remainingTime - b.remainingTime;
                  if (algorithm === 'Priority') return a.priority - b.priority;
                  return 0;
                });
            }
            
            return queueToShow.map((proc, idx) => (
              <div key={proc.pid} className="bg-blue-600 rounded px-4 py-2 flex items-center gap-2">
                <span className="font-bold">{idx + 1}.</span>
                <span>{proc.name}</span>
                <span className="text-xs opacity-75">(RT: {proc.remainingTime})</span>
                <span className={`${getPriorityColor(proc.priority)} px-2 py-1 rounded text-xs font-bold`}>
                  P{proc.priority}
                </span>
              </div>
            ));
          })()}
          {stats.readyProcesses === 0 && (
            <div className="text-gray-500 text-sm">No processes in ready queue</div>
          )}
        </div>
      </div>
    </div>
  );

  // Process Table View
  const TableView = () => (
    <div className="bg-gray-800 rounded-lg overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-700">
          <tr>
            <th className="px-4 py-3 text-left">PID</th>
            <th className="px-4 py-3 text-left">Name</th>
            <th className="px-4 py-3 text-left">State</th>
            <th className="px-4 py-3 text-left">Burst Time</th>
            <th className="px-4 py-3 text-left">Remaining</th>
            <th className="px-4 py-3 text-left">Priority</th>
            <th className="px-4 py-3 text-left">Arrival</th>
            <th className="px-4 py-3 text-left">Waiting</th>
            <th className="px-4 py-3 text-left">CPU Time</th>
            <th className="px-4 py-3 text-left">Turnaround</th>
            <th className="px-4 py-3 text-left">Actions</th>
          </tr>
        </thead>
        <tbody>
          {processes.map((process) => (
            <tr key={process.pid} className="border-t border-gray-700 hover:bg-gray-750">
              <td className="px-4 py-3">{process.pid}</td>
              <td className="px-4 py-3 font-mono font-bold">{process.name}</td>
              <td className="px-4 py-3">
                <span className={`${getStateColor(process.state)} px-2 py-1 rounded text-xs font-semibold`}>
                  {process.state}
                </span>
              </td>
              <td className="px-4 py-3">{process.burstTime}</td>
              <td className="px-4 py-3 font-bold">
                {Math.max(0, process.remainingTime)}
              </td>
              <td className="px-4 py-3">
                {editingPriority === process.pid ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={tempPriority}
                      onChange={(e) => setTempPriority(e.target.value)}
                      className="w-16 bg-gray-700 px-2 py-1 rounded text-center"
                      min="1"
                      max="10"
                    />
                    <button
                      onClick={() => updateProcessPriority(process.pid, tempPriority)}
                      className="text-green-400 hover:text-green-300"
                    >
                      ✓
                    </button>
                    <button
                      onClick={cancelEditing}
                      className="text-red-400 hover:text-red-300"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className={`${getPriorityColor(process.priority)} px-2 py-1 rounded text-xs font-bold`}>
                      {process.priority}
                    </span>
                    {process.state !== STATES.TERMINATED && (
                      <button
                        onClick={() => startEditingPriority(process.pid, process.priority)}
                        className="text-blue-400 hover:text-blue-300"
                        title="Edit Priority"
                      >
                        <Edit size={14} />
                      </button>
                    )}
                  </div>
                )}
              </td>
              <td className="px-4 py-3">{process.arrivalTime}</td>
              <td className="px-4 py-3">{process.waitingTime}</td>
              <td className="px-4 py-3">{process.cpuTime}</td>
              <td className="px-4 py-3">{process.turnaroundTime || '-'}</td>
              <td className="px-4 py-3">
                {process.state !== STATES.TERMINATED && (
                  <button
                    onClick={() => terminateProcess(process.pid)}
                    className="text-red-400 hover:text-red-300"
                    title="Terminate Process"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      
      {processes.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          No processes. Click "Create Process" to start.
        </div>
      )}
    </div>
  );

  // Process Creation Modal
  const ProcessCreationModal = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
        <h3 className="text-xl font-bold mb-4">Create Custom Process</h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Process Name</label>
            <input
              type="text"
              value={newProcessName}
              onChange={(e) => setNewProcessName(e.target.value)}
              className="w-full bg-gray-700 px-3 py-2 rounded"
              placeholder="Enter process name"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">
              Burst Time: <span className="font-bold">{newProcessBurst}</span>
            </label>
            <input
              type="range"
              min="1"
              max="20"
              value={newProcessBurst}
              onChange={(e) => setNewProcessBurst(e.target.value)}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-400">
              <span>1 (Short)</span>
              <span>20 (Long)</span>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">
              Priority: <span className={`font-bold ${getPriorityColor(newProcessPriority)} px-2 py-1 rounded`}>
                {newProcessPriority} {newProcessPriority <= 3 ? '(High)' : newProcessPriority <= 7 ? '(Medium)' : '(Low)'}
              </span>
            </label>
            <input
              type="range"
              min="1"
              max="10"
              value={newProcessPriority}
              onChange={(e) => setNewProcessPriority(e.target.value)}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-400">
              <span>1 (Highest)</span>
              <span>10 (Lowest)</span>
            </div>
          </div>
          
          <div className="flex gap-2 pt-4">
            <button
              onClick={() => createProcess(true)}
              className="flex-1 bg-green-600 hover:bg-green-700 px-4 py-2 rounded font-semibold flex items-center justify-center gap-2"
            >
              <Plus size={20} />
              Create Process
            </button>
            <button
              onClick={() => setShowProcessForm(false)}
              className="flex-1 bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded font-semibold"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold mb-2">Process Manager Dashboard</h1>
        <p className="text-gray-400 mb-6">Round Robin Scheduling with Quantum = {timeQuantum}</p>

        {/* Controls */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <div className="flex flex-wrap gap-4 items-center">
            <button
              onClick={() => setIsRunning(!isRunning)}
              className={`flex items-center gap-2 px-4 py-2 rounded font-semibold ${
                isRunning ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              {isRunning ? <Pause size={20} /> : <Play size={20} />}
              {isRunning ? 'Pause Simulation' : 'Start Simulation'}
            </button>

            <button
              onClick={() => setShowProcessForm(true)}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded font-semibold"
            >
              <Plus size={20} />
              Create Custom Process
            </button>

            <button
              onClick={() => createProcess(false)}
              className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded font-semibold"
            >
              <Plus size={20} />
              Create Random Process
            </button>

            <button
              onClick={createTestProcesses}
              className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 px-4 py-2 rounded font-semibold"
            >
              Load Test Case (RR Q=2)
            </button>

            <button
              onClick={resetAll}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 px-4 py-2 rounded font-semibold"
            >
              <RefreshCw size={20} />
              Reset All
            </button>

            <div className="flex items-center gap-2">
              <label className="font-semibold">Scheduling:</label>
              <select
                value={algorithm}
                onChange={(e) => setAlgorithm(e.target.value)}
                className="bg-gray-700 px-3 py-2 rounded font-semibold"
              >
                <option value="FCFS">FCFS</option>
                <option value="SJF">SJF (Shortest Job First)</option>
                <option value="Priority">Priority Scheduling</option>
                <option value="RoundRobin">Round Robin</option>
              </select>
            </div>

            {algorithm === 'RoundRobin' && (
              <div className="flex items-center gap-2">
                <label className="font-semibold">Quantum:</label>
                <input
                  type="number"
                  value={timeQuantum}
                  onChange={(e) => setTimeQuantum(Math.max(1, parseInt(e.target.value) || 1))}
                  className="bg-gray-700 px-3 py-2 rounded w-20 font-semibold"
                  min="1"
                />
              </div>
            )}
          </div>
          
          <div className="mt-4 text-sm text-gray-400">
            <p>Priority Scale: <span className="text-red-500">1-2 (High)</span> • 
              <span className="text-orange-500"> 3-4 (Medium-High)</span> • 
              <span className="text-yellow-500"> 5-6 (Medium)</span> • 
              <span className="text-blue-500"> 7-8 (Medium-Low)</span> • 
              <span className="text-gray-500"> 9-10 (Low)</span>
            </p>
            {algorithm === 'RoundRobin' && (
              <p className="mt-1">Round Robin Quantum: {timeQuantum} time units per process</p>
            )}
          </div>
        </div>

        {/* View Toggle */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setView('dashboard')}
            className={`px-4 py-2 rounded font-semibold ${view === 'dashboard' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setView('table')}
            className={`px-4 py-2 rounded font-semibold ${view === 'table' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
          >
            Process Table
          </button>
          <button
            onClick={() => setView('gantt')}
            className={`px-4 py-2 rounded font-semibold ${view === 'gantt' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
          >
            Gantt Chart
          </button>
        </div>

        {/* Content Views */}
        {view === 'dashboard' && <DashboardView />}
        {view === 'table' && <TableView />}
        {view === 'gantt' && <GanttChart />}

        {/* Process Creation Modal */}
        {showProcessForm && <ProcessCreationModal />}
      </div>
    </div>
  );
};

export default ProcessManager;
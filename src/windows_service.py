import win32serviceutil
import win32service
import win32event
import servicemanager
import sys
import os

class LifeOSService(win32serviceutil.ServiceFramework):
    """
    Runs as a Windows Service (starts with boot, restarts if crashes).
    """
    _svc_name_ = "LifeOS_Orchestrator"
    _svc_display_name_ = "Life-OS Digital Twin Service"
    _svc_description_ = "Runs the FastAPI backend and orchestrates background tasks for Life-OS."
    
    def __init__(self, args):
        win32serviceutil.ServiceFramework.__init__(self, args)
        self.hWaitStop = win32event.CreateEvent(None, 0, 0, None)
        self.running = True
    
    def SvcDoRun(self):
        servicemanager.LogMsg(servicemanager.EVENTLOG_INFORMATION_TYPE,
                              servicemanager.PYS_SERVICE_STARTED,
                              (self._svc_name_, ''))
        self.main()
    
    def main(self):
        """Start FastAPI server and all background workers"""
        # Ensure we are in the correct directory if running as a service
        service_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        os.chdir(service_dir)
        sys.path.insert(0, service_dir)
        
        import uvicorn
        from src.api import app
        
        # Start API server
        config = uvicorn.Config(app, host="127.0.0.1", port=8000, log_level="info")
        server = uvicorn.Server(config)
        
        # Run until stop event
        # (uvicorn handles its own event loop, in a real production service we might want 
        # to run it in a separate thread and wait on self.hWaitStop here)
        server.run()
    
    def SvcStop(self):
        self.running = False
        self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)
        win32event.SetEvent(self.hWaitStop)

if __name__ == '__main__':
    if len(sys.argv) == 1:
        servicemanager.Initialize()
        servicemanager.PrepareToHostSingle(LifeOSService)
        servicemanager.StartServiceCtrlDispatcher()
    else:
        win32serviceutil.HandleCommandLine(LifeOSService)

import os

class IntelligentRouter:
    """
    Routes each request to optimal model based on Privacy, Cost, Latency.
    """
    def __init__(self):
        self.local_models = {
            "health_private": "llama3.1:8b",
            "fast_local": "mistral:7b"
        }
        
        self.openrouter_models = {
            "fast_cheap": "openai/gpt-3.5-turbo",
            "balanced": "anthropic/claude-3-haiku",
            "premium": "anthropic/claude-3.5-sonnet",
            "vision": "openai/gpt-4o-mini"
        }
        
    def route(self, task: dict) -> str:
        """
        Returns model identifier based on task properties.
        """
        task_type = task.get("type", "chat")
        privacy = task.get("privacy", "normal")
        
        # Rule 1: Private health data never leaves local
        if privacy == "high" or "symptom" in task_type:
            return f"local/{self.local_models['health_private']}"
            
        # Rule 2: Vision tasks
        if task_type in ["meal_photo", "form_analysis"]:
            return f"openrouter/{self.openrouter_models['vision']}"
            
        # Rule 3: Complex reasoning
        if task_type in ["financial_advice", "automation_builder"]:
            return f"openrouter/{self.openrouter_models['premium']}"
            
        return f"openrouter/{self.openrouter_models['fast_cheap']}"

"""Record a scheduled post: python3 rec.py PID network id uuid"""
import json, sys
f = "scheduled.json"
d = json.load(open(f))
pid, net, i, u = sys.argv[1:5]
d.setdefault(pid, {})[net] = {"id": int(i), "uuid": u}
json.dump(d, open(f, "w"), indent=1)
print(len(d), "posts recorded")

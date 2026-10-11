"""Build Metricool payloads for a content ID. Usage: python3 payloads.py P02 [P03 ...]"""
import json, sys
import campaign as c

IDX = {p[0]: i for i, p in enumerate(c.POSTS)}


def payload(pid, network):
    i = IDX[pid]
    p = c.POSTS[i]
    _, d, t = list(c.schedule())[i]
    files = p[3]
    media = [c.BASE_URL + f for f in files if not f.endswith("-cover.jpg")]
    info = {"autoPublish": True, "draft": False, "descendants": [], "firstCommentText": "", "hasNotReadNotes": False,
            "media": media, "mediaAltText": [], "providers": [{"network": network}],
            "publicationDate": {"dateTime": f"{d}T{t}:00", "timezone": "Asia/Riyadh"}, "shortener": False,
            "smartLinkData": {"ids": []}, "text": c.caption(p, network)}
    reel = p[1] == "Reel"
    if network == "instagram":
        info["instagramData"] = {"type": "REEL" if reel else "POST", "isAiGenerated": True}
    else:
        info["facebookData"] = {"type": "REEL" if reel else "POST"}
    if reel:
        info["videoThumbnailUrl"] = c.BASE_URL + [f for f in files if f.endswith("-cover.jpg")][0]
    return f"{d}T{t}:00+03:00", info


if __name__ == "__main__":
    for pid in sys.argv[1:]:
        for net in ("instagram", "facebook"):
            date, info = payload(pid, net)
            print(f"== {pid} {net} {date}")
            print(json.dumps(info, ensure_ascii=False))

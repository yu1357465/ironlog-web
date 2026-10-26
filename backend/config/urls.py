from django.conf import settings
from django.contrib import admin
from django.http import FileResponse, HttpResponse
from django.urls import include, path, re_path
from django.views.decorators.csrf import ensure_csrf_cookie


@ensure_csrf_cookie
def spa(request):
    """Serve the React app for every non-API route; the client router takes over."""
    index = settings.FRONTEND_DIST / "index.html"
    if index.exists():
        return FileResponse(index.open("rb"), content_type="text/html")
    return HttpResponse(
        "Frontend not built. Run `npm run build` in frontend/, "
        "or use the Vite dev server (npm run dev) during development.",
        content_type="text/plain",
        status=503,
    )


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("ironlog.urls")),
    re_path(r"^(?!api/|admin/|static/).*$", spa),
]
